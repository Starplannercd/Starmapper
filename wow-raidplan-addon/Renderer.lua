local RPV = RaidPlanViewer

RPV.Renderer = {}
local R = RPV.Renderer

-- ── Internal state ─────────────────────────────────────────────────────────
local tokenFrames  = {}   -- [playerId] = { frame, icon, nameFStr, borderTex }
local arrowFrames  = {}   -- [arrowId]  = table of dot frames
local markerFrames = {}   -- [markerId] = frame
local textFrames   = {}   -- [textId]   = { frame, fstr }
local scaleX, scaleY = 1, 1

-- ── Helpers ────────────────────────────────────────────────────────────────

-- Convert web canvas coords to WoW canvas coords.
-- Web: (0,0) top-left, Y increases down.
-- WoW SetPoint BOTTOMLEFT: (0,0) bottom-left, Y increases up.
local function webToWoW(wx, wy)
    return wx * scaleX, (RPV.CANVAS_H - wy) * scaleY
end

local function lerp(a, b, t) return a + (b - a) * t end

-- Recompute scale based on current canvas size
local function updateScale()
    local cw = RPV.canvas:GetWidth()
    local ch = RPV.canvas:GetHeight()
    scaleX = cw / RPV.CANVAS_W
    scaleY = ch / RPV.CANVAS_H
end

-- ── Frame recycling helpers ────────────────────────────────────────────────

local dotPool = {}   -- reusable 1x1 square frames for drawing lines
local dotPoolIdx = 0

local function acquireDot()
    dotPoolIdx = dotPoolIdx + 1
    if dotPool[dotPoolIdx] then
        dotPool[dotPoolIdx]:Show()
        return dotPool[dotPoolIdx]
    end
    local f = CreateFrame("Frame", nil, RPV.canvas)
    f:SetSize(3, 3)
    local t = f:CreateTexture(nil, "ARTWORK")
    t:SetAllPoints()
    t:SetTexture("Interface\\Buttons\\WHITE8X8")
    f._tex = t
    dotPool[dotPoolIdx] = f
    return f
end

local function resetDotPool()
    for i = 1, dotPoolIdx do
        if dotPool[i] then dotPool[i]:Hide() end
    end
    dotPoolIdx = 0
end

-- Draw a line with coloured dots from (x1,y1) to (x2,y2) in WoW coords
local function drawLine(x1, y1, x2, y2, r, g, b, thickness)
    local dx   = x2 - x1
    local dy   = y2 - y1
    local len  = math.sqrt(dx * dx + dy * dy)
    if len < 1 then return end
    local dotSize = math.max(thickness * scaleX, 1.5)
    local step    = math.max(dotSize * 0.55, 1)
    local steps   = math.ceil(len / step)
    for i = 0, steps do
        local t   = i / steps
        local dot = acquireDot()
        dot:SetSize(dotSize, dotSize)
        dot:SetPoint("CENTER", RPV.canvas, "BOTTOMLEFT",
            x1 + t * dx, y1 + t * dy)
        dot._tex:SetVertexColor(r, g, b, 0.92)
    end
end

-- Draw a small arrowhead triangle at (tx,ty) pointing in direction (dx,dy)
local function drawArrowhead(tx, ty, dx, dy, r, g, b, sz)
    sz = sz or 7
    local len = math.sqrt(dx*dx + dy*dy)
    if len == 0 then return end
    local ux, uy = dx/len, dy/len       -- unit forward
    local px, py = -uy, ux              -- unit perpendicular

    -- Three verts of the triangle: tip + two base corners
    local points = {
        { tx + ux * sz,       ty + uy * sz       },   -- tip
        { tx - ux * sz * 0.4 + px * sz * 0.55, ty - uy * sz * 0.4 + py * sz * 0.55 },
        { tx - ux * sz * 0.4 - px * sz * 0.55, ty - uy * sz * 0.4 - py * sz * 0.55 },
    }
    -- Approximate the triangle with three short lines
    for i = 1, 3 do
        local a = points[i]
        local b = points[(i % 3) + 1]
        drawLine(a[1], a[2], b[1], b[2], r, g, b, 1.5)
    end
end

-- ── Clear all visual objects ────────────────────────────────────────────────
function R.ClearAll()
    for _, tf in pairs(tokenFrames) do
        tf.frame:Hide()
    end
    tokenFrames = {}

    resetDotPool()

    for _, mf in pairs(markerFrames) do mf:Hide() end
    markerFrames = {}

    for _, tf in pairs(textFrames) do tf.frame:Hide() end
    textFrames = {}
end

-- ── Build token frames for a page ──────────────────────────────────────────
function R.BuildPage(page)
    R.ClearAll()
    updateScale()

    local tokenSize = RPV.TOKEN_SIZE
    for id, player in pairs(page.players or {}) do
        local frame = CreateFrame("Frame", nil, RPV.canvas)
        frame:SetSize(tokenSize, tokenSize)

        -- Border (coloured square outline)
        local r, g, b = RPV.HexToRGB(player.color or "#ffffff")
        local border = frame:CreateTexture(nil, "BACKGROUND")
        border:SetAllPoints()
        border:SetTexture("Interface\\Buttons\\WHITE8X8")
        border:SetVertexColor(r * 0.5, g * 0.5, b * 0.5, 1)

        -- Icon (inset 2px from border)
        local icon = frame:CreateTexture(nil, "ARTWORK")
        icon:SetPoint("TOPLEFT",     frame, "TOPLEFT",     2, -2)
        icon:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -2, 2)
        local texPath = RPV.ClassIcons[player.classKey] or RPV.ClassIcons["add"]
        icon:SetTexture(texPath)

        -- Colour tint overlay (semi-transparent role colour on top)
        local tint = frame:CreateTexture(nil, "OVERLAY")
        tint:SetAllPoints()
        tint:SetTexture("Interface\\Buttons\\WHITE8X8")
        tint:SetVertexColor(r, g, b, 0.18)

        -- Player name label
        local nameStr = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        nameStr:SetPoint("TOP", frame, "BOTTOM", 0, -1)
        nameStr:SetText(player.name or "")
        nameStr:SetTextColor(0.9, 0.85, 0.7, 1)

        tokenFrames[id] = { frame = frame, icon = icon, nameStr = nameStr, r = r, g = g, b = b }
    end
end

-- ── Update every OnUpdate tick ──────────────────────────────────────────────
function R.UpdateFrame(kfA, kfB, t, players)
    updateScale()

    local tokenSize = RPV.TOKEN_SIZE * math.min(scaleX, scaleY)
    local hidden    = {}
    for _, id in ipairs(kfA._hiddenPlayerIds or {}) do hidden[id] = true end

    -- ── Tokens ──
    for id, tf in pairs(tokenFrames) do
        if hidden[id] then
            tf.frame:Hide()
        else
            local posA = kfA[id] or { x = RPV.CANVAS_W * 0.5, y = RPV.CANVAS_H * 0.5 }
            local posB = kfB[id] or posA
            local wx = lerp(posA.x, posB.x, t)
            local wy = lerp(posA.y, posB.y, t)
            local sx, sy = webToWoW(wx, wy)
            local player = players and players[id]
            local scale  = (player and player.scale or 1)
            local sz     = tokenSize * scale
            tf.frame:SetSize(sz, sz)
            tf.frame:SetPoint("CENTER", RPV.canvas, "BOTTOMLEFT", sx, sy)
            tf.frame:Show()
        end
    end

    -- ── Reset line dots ──
    resetDotPool()

    -- ── Arrows ──
    for _, arrow in ipairs(kfA._arrows or {}) do
        if not arrow.hidden then
            local r, g, b = RPV.HexToRGB(arrow.color or "#ff4444")
            local x1, y1 = webToWoW(arrow.x1, arrow.y1)
            local x2, y2 = webToWoW(arrow.x2, arrow.y2)
            local w = (arrow.strokeWidth or 2.5) * math.min(scaleX, scaleY)
            drawLine(x1, y1, x2, y2, r, g, b, w)
            -- Arrowhead pointing from A toward B
            local dx, dy = x2 - x1, y2 - y1
            drawArrowhead(x2, y2, dx, dy, r, g, b, 6 * math.min(scaleX, scaleY))
            if arrow.twoHeaded then
                drawArrowhead(x1, y1, -dx, -dy, r, g, b, 6 * math.min(scaleX, scaleY))
            end
        end
    end

    -- ── World markers ──
    local markerSize = RPV.MARKER_SIZE * math.min(scaleX, scaleY)
    local usedMarkerIds = {}

    for _, marker in ipairs(kfA._markers or {}) do
        if not marker.hidden then
            local sx, sy = webToWoW(marker.x, marker.y)
            local sz     = markerSize * (marker.scale or 1)
            local mf     = markerFrames[marker.id]

            if not mf then
                mf = CreateFrame("Frame", nil, RPV.canvas)
                local tex = mf:CreateTexture(nil, "ARTWORK")
                tex:SetAllPoints()
                local mIdx = RPV.MarkerIndex[marker.type] or 1
                tex:SetTexture("Interface\\TargetingFrame\\UI-RaidTargetingIcon_" .. mIdx)
                mf._tex = tex
                markerFrames[marker.id] = mf
            end

            mf:SetSize(sz, sz)
            mf:SetPoint("CENTER", RPV.canvas, "BOTTOMLEFT", sx, sy)
            mf:Show()
            usedMarkerIds[marker.id] = true
        end
    end

    for id, mf in pairs(markerFrames) do
        if not usedMarkerIds[id] then mf:Hide() end
    end

    -- ── Text labels ──
    local usedTextIds = {}

    for _, txt in ipairs(kfA._texts or {}) do
        if not txt.hidden then
            local sx, sy = webToWoW(txt.x, txt.y)
            local tf     = textFrames[txt.id]

            if not tf then
                local frame = CreateFrame("Frame", nil, RPV.canvas)
                local bg    = frame:CreateTexture(nil, "BACKGROUND")
                bg:SetAllPoints()
                bg:SetTexture("Interface\\Buttons\\WHITE8X8")
                bg:SetVertexColor(0, 0, 0, 0.55)

                local fstr = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
                fstr:SetPoint("CENTER")
                fstr:SetJustifyH("CENTER")

                tf = { frame = frame, fstr = fstr, bg = bg }
                textFrames[txt.id] = tf
            end

            local r, g, b = RPV.HexToRGB(txt.color or "#ffffff")
            tf.fstr:SetText(txt.text or "")
            tf.fstr:SetTextColor(r, g, b, 1)

            local fontSize = math.max(6, math.floor((txt.fontSize or 13) * math.min(scaleX, scaleY)))
            local fontPath, _, fontFlags = tf.fstr:GetFont()
            tf.fstr:SetFont(fontPath, fontSize, fontFlags)

            tf.frame:SetPoint("CENTER", RPV.canvas, "BOTTOMLEFT", sx, sy)
            tf.frame:SetSize(tf.fstr:GetStringWidth() + 8, tf.fstr:GetStringHeight() + 4)
            tf.frame:Show()
            usedTextIds[txt.id] = true
        end
    end

    for id, tf in pairs(textFrames) do
        if not usedTextIds[id] then tf.frame:Hide() end
    end
end
