local RPV = RaidPlanViewer

RPV.Animation = {}
local Anim = RPV.Animation

local playing    = false
local elapsed    = 0.0      -- seconds into current page
local pageIdx    = 1
local numSegs    = 0        -- keyframes - 1 for current page
local totalTime  = 0.0      -- numSegs * FRAME_DURATION

-- ── Ticker ─────────────────────────────────────────────────────────────────
local ticker = CreateFrame("Frame")
ticker:SetScript("OnUpdate", function(_, dt)
    if not playing or not RPV.plan then return end

    elapsed = elapsed + dt

    -- Loop when we reach the end of the page
    if elapsed >= totalTime and totalTime > 0 then
        elapsed = elapsed % totalTime
    end

    -- Compute which segment and local t (0-1)
    local seg = math.floor(elapsed / RPV.FRAME_DURATION)
    seg       = math.min(seg, numSegs - 1)
    local t   = (elapsed - seg * RPV.FRAME_DURATION) / RPV.FRAME_DURATION
    t         = math.max(0, math.min(1, t))

    local page = RPV.plan.pages[pageIdx]
    if not page then return end
    local kfA = page.keyframes[seg + 1]
    local kfB = page.keyframes[seg + 2] or kfA
    if not kfA then return end

    RPV.Renderer.UpdateFrame(kfA, kfB, t, page.players)
end)

-- ── Public API ─────────────────────────────────────────────────────────────
function Anim.SetPage(idx)
    pageIdx = idx
    elapsed = 0.0
    if RPV.plan then
        local page = RPV.plan.pages[idx]
        numSegs   = page and math.max(0, #page.keyframes - 1) or 0
        totalTime = numSegs * RPV.FRAME_DURATION
    end
end

function Anim.Play()
    playing = true
end

function Anim.Pause()
    playing = false
end

function Anim.IsPlaying()
    return playing
end
