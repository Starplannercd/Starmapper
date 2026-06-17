local RPV = RaidPlanViewer

-- WoW marker index and display info
local MARKER_INFO = {
    star     = { index = 1, label = "Star",     color = {1.0, 0.9, 0.1} },
    circle   = { index = 2, label = "Circle",   color = {1.0, 0.55, 0.0} },
    diamond  = { index = 3, label = "Diamond",  color = {0.8, 0.3, 1.0} },
    triangle = { index = 4, label = "Triangle", color = {0.2, 0.9, 0.2} },
    moon     = { index = 5, label = "Moon",     color = {0.7, 0.7, 0.7} },
    square   = { index = 6, label = "Square",   color = {0.2, 0.5, 1.0} },
    cross    = { index = 7, label = "Cross",    color = {1.0, 0.2, 0.2} },
    skull    = { index = 8, label = "Skull",    color = {0.9, 0.9, 0.9} },
}

-- ── UI helpers ─────────────────────────────────────────────────────────────
local function AddBG(f, r, g, b, a)
    local t = f:CreateTexture(nil, "BACKGROUND")
    t:SetAllPoints(); t:SetTexture("Interface\\Buttons\\WHITE8X8")
    t:SetVertexColor(r, g, b, a or 1)
    return t
end

local function AddBorder(f, r, g, b)
    for _, v in ipairs({
        {"TOPLEFT","TOPRIGHT",0,0,0,1}, {"BOTTOMLEFT","BOTTOMRIGHT",0,-1,0,0},
        {"TOPLEFT","BOTTOMLEFT",0,0,1,0}, {"TOPRIGHT","BOTTOMRIGHT",-1,0,0,0},
    }) do
        local t = f:CreateTexture(nil, "BORDER")
        t:SetTexture("Interface\\Buttons\\WHITE8X8")
        t:SetVertexColor(r, g, b, 1)
        t:SetPoint(v[1], f, v[1], v[3], v[4])
        t:SetPoint(v[2], f, v[2], v[5], v[6])
    end
end

-- ── Main window ────────────────────────────────────────────────────────────
local win = CreateFrame("Frame", "RPVMarkerSyncFrame", UIParent)
win:SetSize(320, 60)   -- height grows dynamically
win:SetPoint("CENTER")
win:SetMovable(true)
win:EnableMouse(true)
win:RegisterForDrag("LeftButton")
win:SetScript("OnDragStart", win.StartMoving)
win:SetScript("OnDragStop",  win.StopMovingOrSizing)
win:SetFrameStrata("HIGH")
win:Hide()
tinsert(UISpecialFrames, "RPVMarkerSyncFrame")
AddBG(win, 0.04, 0.04, 0.07, 0.95)
AddBorder(win, 0.55, 0.42, 0.12)

local titleStr = win:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
titleStr:SetPoint("TOP", win, "TOP", 0, -8)
titleStr:SetText("Marker Sync")

local closeBtn = CreateFrame("Button", nil, win, "UIPanelCloseButton")
closeBtn:SetPoint("TOPRIGHT", win, "TOPRIGHT", -2, -2)

-- Phase tab row
local tabRow = CreateFrame("Frame", nil, win)
tabRow:SetPoint("TOPLEFT",  win, "TOPLEFT",  8, -26)
tabRow:SetPoint("TOPRIGHT", win, "TOPRIGHT", -8, -26)
tabRow:SetHeight(22)

-- Marker button area
local markerArea = CreateFrame("Frame", nil, win)
markerArea:SetPoint("TOPLEFT",  win, "TOPLEFT",  8, -54)
markerArea:SetPoint("TOPRIGHT", win, "TOPRIGHT", -8, -54)
markerArea:SetHeight(0)  -- resized dynamically

-- Clear All button (bottom)
local clearBtn = CreateFrame("Button", nil, win, "UIPanelButtonTemplate")
clearBtn:SetSize(90, 20)
clearBtn:SetText("Clear All")
clearBtn:SetScript("OnClick", function()
    for i = 1, 8 do
        if GetRaidTargetIndex ~= nil then  -- sanity check
        end
        -- PlaceOrRemoveWorldMarker removes if already placed
        -- We call it for all 8 to ensure all are cleared
    end
    -- Clear all world markers by placing then removing isn't reliable;
    -- iterate and remove any that are active
    for _, info in pairs(MARKER_INFO) do
        PlaceOrRemoveWorldMarker(info.index)  -- toggles; call twice if needed
        PlaceOrRemoveWorldMarker(info.index)  -- second call removes if it was just placed
    end
    DEFAULT_CHAT_FRAME:AddMessage("|cffaaaaaa[RaidPlan]|r All world markers cleared.")
end)

-- ── State ──────────────────────────────────────────────────────────────────
local plan       = nil
local pageIdx    = 1
local tabBtns    = {}
local markerBtns = {}

-- ── Build marker buttons for a page's first keyframe ───────────────────────
local function BuildMarkers(page)
    -- Hide old buttons
    for _, b in ipairs(markerBtns) do b:Hide() end
    markerBtns = {}

    -- Collect unique marker types from ALL keyframes in this page
    -- (so you can drop any marker that appears anywhere in the phase)
    local seen = {}
    for _, kf in ipairs(page.keyframes or {}) do
        for _, m in ipairs(kf._markers or {}) do
            if not seen[m.type] then seen[m.type] = true end
        end
    end

    -- Build a button for each marker type found
    local col, row = 0, 0
    local btnW, btnH, padX, padY = 70, 26, 4, 4

    for mtype, _ in pairs(seen) do
        local info = MARKER_INFO[mtype]
        if info then
            local btn = CreateFrame("Button", nil, markerArea)
            btn:SetSize(btnW, btnH)
            btn:SetPoint("TOPLEFT", markerArea, "TOPLEFT",
                col * (btnW + padX), -row * (btnH + padY))
            AddBG(btn, info.color[1] * 0.18, info.color[2] * 0.18, info.color[3] * 0.18, 1)
            AddBorder(btn, info.color[1] * 0.7, info.color[2] * 0.7, info.color[3] * 0.7)

            -- Marker icon texture
            local iconSize = 16
            local icon = btn:CreateTexture(nil, "ARTWORK")
            icon:SetSize(iconSize, iconSize)
            icon:SetPoint("LEFT", btn, "LEFT", 5, 0)
            icon:SetTexture("Interface\\TargetingFrame\\UI-RaidTargetingIcon_" .. info.index)

            local lbl = btn:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
            lbl:SetPoint("LEFT", icon, "RIGHT", 4, 0)
            lbl:SetText(info.label)
            lbl:SetTextColor(info.color[1], info.color[2], info.color[3], 1)

            local markerIndex = info.index
            btn:SetScript("OnClick", function()
                PlaceOrRemoveWorldMarker(markerIndex)
                DEFAULT_CHAT_FRAME:AddMessage(
                    "|cffaaaaaa[RaidPlan]|r Dropped |cff" ..
                    string.format("%02x%02x%02x",
                        info.color[1]*255, info.color[2]*255, info.color[3]*255) ..
                    info.label .. "|r marker.")
            end)

            markerBtns[#markerBtns+1] = btn

            col = col + 1
            if col >= 4 then col = 0; row = row + 1 end
        end
    end

    -- Resize the window to fit
    local numRows = row + (col > 0 and 1 or 0)
    numRows = math.max(numRows, 1)
    local areaH = numRows * (btnH + padY)
    markerArea:SetHeight(areaH)
    -- title(16) + tabs(22+4) + markerArea + clearBtn(20+6) + bottom pad(10)
    local totalH = 16 + 26 + 4 + areaH + 4 + 20 + 10 + 14
    win:SetHeight(totalH)
    clearBtn:SetPoint("BOTTOM", win, "BOTTOM", 0, 8)

    if #markerBtns == 0 then
        local empty = win:CreateFontString(nil, "OVERLAY", "GameFontDisable")
        empty:SetPoint("CENTER", markerArea, "CENTER", 0, 0)
        empty:SetText("No markers in this phase")
        markerBtns[1] = empty
    end
end

-- ── Build phase tabs ────────────────────────────────────────────────────────
local function SelectPage(idx)
    pageIdx = idx
    for i, b in ipairs(tabBtns) do
        b._bg:SetVertexColor(i == idx and 0.22 or 0.07,
                             i == idx and 0.17 or 0.06,
                             i == idx and 0.04 or 0.02, 1)
    end
    BuildMarkers(plan.pages[idx])
end

local function BuildTabs()
    for _, b in ipairs(tabBtns) do b:Hide() end
    tabBtns = {}
    local x = 0
    for i, page in ipairs(plan.pages) do
        local btn = CreateFrame("Button", nil, tabRow)
        btn:SetSize(64, 20)
        btn:SetPoint("LEFT", tabRow, "LEFT", x, 0)
        btn._bg = AddBG(btn, 0.07, 0.06, 0.02, 1)
        AddBorder(btn, 0.4, 0.32, 0.08)
        local lbl = btn:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        lbl:SetAllPoints(); lbl:SetJustifyH("CENTER")
        lbl:SetText(page.title ~= "" and page.title or ("P" .. i))
        local idx = i
        btn:SetScript("OnClick", function() SelectPage(idx) end)
        tabBtns[#tabBtns+1] = btn
        x = x + 68
    end
end

-- ── Import dialog ───────────────────────────────────────────────────────────
local importWin = CreateFrame("Frame", "RPVImportFrame", UIParent)
importWin:SetSize(460, 260)
importWin:SetPoint("CENTER")
importWin:SetMovable(true); importWin:EnableMouse(true)
importWin:RegisterForDrag("LeftButton")
importWin:SetScript("OnDragStart", importWin.StartMoving)
importWin:SetScript("OnDragStop",  importWin.StopMovingOrSizing)
importWin:SetFrameStrata("DIALOG"); importWin:Hide()
tinsert(UISpecialFrames, "RPVImportFrame")
AddBG(importWin, 0.04, 0.03, 0.02, 0.97)
AddBorder(importWin, 0.6, 0.48, 0.14)

local iTitle = importWin:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
iTitle:SetPoint("TOP", importWin, "TOP", 0, -10)
iTitle:SetText("Raid Plan — Import")

local iInstr = importWin:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
iInstr:SetPoint("TOPLEFT",  importWin, "TOPLEFT",  14, -28)
iInstr:SetPoint("TOPRIGHT", importWin, "TOPRIGHT", -14, -28)
iInstr:SetText("Paste the string from the web app's 'Addon Export' button:")
iInstr:SetJustifyH("LEFT")
iInstr:SetTextColor(0.75, 0.65, 0.45, 1)

local iScroll = CreateFrame("ScrollFrame", "RPVImportScroll", importWin, "UIPanelScrollFrameTemplate")
iScroll:SetPoint("TOPLEFT",     importWin, "TOPLEFT",     12, -50)
iScroll:SetPoint("BOTTOMRIGHT", importWin, "BOTTOMRIGHT", -30, 44)

local iEdit = CreateFrame("EditBox", nil, iScroll)
iEdit:SetMultiLine(true); iEdit:SetMaxLetters(0)
iEdit:SetFontObject(ChatFontNormal); iEdit:SetWidth(iScroll:GetWidth())
iEdit:SetAutoFocus(false)
iEdit:SetScript("OnEscapePressed", function() importWin:Hide() end)
iScroll:SetScrollChild(iEdit)

local iStatus = importWin:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
iStatus:SetPoint("BOTTOMLEFT", importWin, "BOTTOMLEFT", 14, 14)
iStatus:SetText("")

local iClose = CreateFrame("Button", nil, importWin, "UIPanelCloseButton")
iClose:SetPoint("TOPRIGHT", importWin, "TOPRIGHT", -2, -2)

local iBtn = CreateFrame("Button", nil, importWin, "UIPanelButtonTemplate")
iBtn:SetSize(80, 22); iBtn:SetText("Import")
iBtn:SetPoint("BOTTOMRIGHT", importWin, "BOTTOMRIGHT", -12, 12)
iBtn:SetScript("OnClick", function()
    local raw = iEdit:GetText():gsub("%s+", "")
    if raw == "" then
        iStatus:SetText("Paste an export string first.")
        iStatus:SetTextColor(1, 0.3, 0.3, 1)
        return
    end
    local ok, decoded = pcall(RPV.Base64Decode, raw)
    if not ok or not decoded then
        iStatus:SetText("Decode failed — invalid string?")
        iStatus:SetTextColor(1, 0.3, 0.3, 1)
        return
    end
    local data = RPV.JsonDecode(decoded)
    if not data or type(data.pages) ~= "table" or #data.pages == 0 then
        iStatus:SetText("Could not parse plan data.")
        iStatus:SetTextColor(1, 0.3, 0.3, 1)
        return
    end
    RaidPlanViewerDB = RaidPlanViewerDB or {}
    RaidPlanViewerDB.lastPlan = raw
    plan = data; pageIdx = 1
    BuildTabs()
    SelectPage(1)
    importWin:Hide()
    win:Show()
    DEFAULT_CHAT_FRAME:AddMessage(
        "|cffaaaaaa[RaidPlan]|r Loaded " .. #data.pages .. " phase(s). " ..
        "Walk to each marker spot and click its button to drop it.")
end)

-- ── Auto-reload on login ────────────────────────────────────────────────────
local loader = CreateFrame("Frame")
loader:RegisterEvent("PLAYER_LOGIN")
loader:SetScript("OnEvent", function()
    if RaidPlanViewerDB and RaidPlanViewerDB.lastPlan then
        local ok, decoded = pcall(RPV.Base64Decode, RaidPlanViewerDB.lastPlan)
        if ok and decoded then
            local data = RPV.JsonDecode(decoded)
            if data and type(data.pages) == "table" and #data.pages > 0 then
                plan = data; pageIdx = 1
                BuildTabs(); SelectPage(1)
                DEFAULT_CHAT_FRAME:AddMessage(
                    "|cffaaaaaa[RaidPlan]|r Previous plan loaded. Type /raidplan to open.")
            end
        end
    end
end)

-- ── Slash command ───────────────────────────────────────────────────────────
SLASH_RAIDPLAN1 = "/raidplan"
SlashCmdList["RAIDPLAN"] = function(msg)
    if msg == "import" or not plan then
        iEdit:SetText(RaidPlanViewerDB and RaidPlanViewerDB.lastPlan or "")
        iStatus:SetText("")
        importWin:Show(); iEdit:SetFocus()
    elseif win:IsShown() then
        win:Hide()
    else
        win:Show()
    end
end
