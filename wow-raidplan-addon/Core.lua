RaidPlanViewer = RaidPlanViewer or {}
local RPV = RaidPlanViewer

local WIN_W = 660
local WIN_H = 430

-- ── Helper: add a plain coloured background texture to any frame ────────────
local function AddBG(frame, r, g, b, a)
    local t = frame:CreateTexture(nil, "BACKGROUND")
    t:SetAllPoints()
    t:SetTexture("Interface\\Buttons\\WHITE8X8")
    t:SetVertexColor(r, g, b, a or 1)
    return t
end

-- ── Helper: add a 1px border around a frame ─────────────────────────────────
local function AddBorder(frame, r, g, b, a)
    a = a or 1
    local function edge(anchor1, anchor2, x1, y1, x2, y2)
        local t = frame:CreateTexture(nil, "BORDER")
        t:SetTexture("Interface\\Buttons\\WHITE8X8")
        t:SetVertexColor(r, g, b, a)
        t:SetPoint(anchor1, frame, anchor1, x1, y1)
        t:SetPoint(anchor2, frame, anchor2, x2, y2)
    end
    edge("TOPLEFT",     "TOPRIGHT",    0,  0,  0,  1)   -- top
    edge("BOTTOMLEFT",  "BOTTOMRIGHT", 0, -1,  0,  0)   -- bottom
    edge("TOPLEFT",     "BOTTOMLEFT",  0,  0,  1,  0)   -- left
    edge("TOPRIGHT",    "BOTTOMRIGHT", -1, 0,  0,  0)   -- right
end

-- ── Main viewer frame ───────────────────────────────────────────────────────
local mainFrame = CreateFrame("Frame", "RaidPlanViewerFrame", UIParent)
mainFrame:SetSize(WIN_W, WIN_H)
mainFrame:SetPoint("CENTER")
mainFrame:SetMovable(true)
mainFrame:EnableMouse(true)
mainFrame:RegisterForDrag("LeftButton")
mainFrame:SetScript("OnDragStart", mainFrame.StartMoving)
mainFrame:SetScript("OnDragStop",  mainFrame.StopMovingOrSizing)
mainFrame:SetFrameStrata("HIGH")
mainFrame:Hide()
tinsert(UISpecialFrames, "RaidPlanViewerFrame")

AddBG(mainFrame, 0.04, 0.04, 0.08, 0.96)
AddBorder(mainFrame, 0.65, 0.52, 0.18, 1)

RPV.mainFrame = mainFrame

-- ── Title ───────────────────────────────────────────────────────────────────
local titleStr = mainFrame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
titleStr:SetPoint("TOP", mainFrame, "TOP", 0, -10)
titleStr:SetText("Raid Plan Viewer")
RPV.titleStr = titleStr

-- ── Close button ────────────────────────────────────────────────────────────
local closeBtn = CreateFrame("Button", nil, mainFrame, "UIPanelCloseButton")
closeBtn:SetPoint("TOPRIGHT", mainFrame, "TOPRIGHT", -2, -2)

-- ── Toolbar ─────────────────────────────────────────────────────────────────
local toolbar = CreateFrame("Frame", nil, mainFrame)
toolbar:SetPoint("TOPLEFT",  mainFrame, "TOPLEFT",  8, -28)
toolbar:SetPoint("TOPRIGHT", mainFrame, "TOPRIGHT", -8, -28)
toolbar:SetHeight(26)

local playBtn = CreateFrame("Button", nil, toolbar, "UIPanelButtonTemplate")
playBtn:SetSize(72, 22)
playBtn:SetPoint("LEFT", toolbar, "LEFT", 0, 0)
playBtn:SetText("Play")
RPV.playBtn = playBtn

local importBtn = CreateFrame("Button", nil, toolbar, "UIPanelButtonTemplate")
importBtn:SetSize(72, 22)
importBtn:SetPoint("LEFT", playBtn, "RIGHT", 4, 0)
importBtn:SetText("Import...")
importBtn:SetScript("OnClick", function() RPV.ShowImport() end)

local tabRow = CreateFrame("Frame", nil, toolbar)
tabRow:SetPoint("LEFT",  importBtn, "RIGHT", 8, 0)
tabRow:SetPoint("RIGHT", toolbar,   "RIGHT", 0, 0)
tabRow:SetHeight(26)
RPV.tabRow = tabRow

-- ── Canvas ───────────────────────────────────────────────────────────────────
local canvas = CreateFrame("Frame", nil, mainFrame)
canvas:SetPoint("TOPLEFT",     mainFrame, "TOPLEFT",     8, -58)
canvas:SetPoint("BOTTOMRIGHT", mainFrame, "BOTTOMRIGHT", -8,  8)
AddBG(canvas, 0.02, 0.04, 0.09, 1)
RPV.canvas = canvas

-- ── State ────────────────────────────────────────────────────────────────────
RPV.plan       = nil
RPV.pageIdx    = 1
RPV.tabButtons = {}

-- ── Phase tab builder ────────────────────────────────────────────────────────
local function SelectPage(idx)
    RPV.pageIdx = idx
    for i, btn in ipairs(RPV.tabButtons) do
        btn._bg:SetVertexColor(i == idx and 0.25 or 0.06,
                               i == idx and 0.20 or 0.05,
                               i == idx and 0.05 or 0.02, 1)
    end
    RPV.Animation.SetPage(idx)
    RPV.Renderer.BuildPage(RPV.plan.pages[idx])
end

function RPV.BuildPhaseTabs()
    for _, btn in ipairs(RPV.tabButtons) do btn:Hide() end
    RPV.tabButtons = {}
    local x = 0
    for i, page in ipairs(RPV.plan and RPV.plan.pages or {}) do
        local btn = CreateFrame("Button", nil, RPV.tabRow)
        btn:SetSize(70, 22)
        btn:SetPoint("LEFT", RPV.tabRow, "LEFT", x, 0)
        btn._bg = AddBG(btn, 0.06, 0.05, 0.02, 1)
        AddBorder(btn, 0.45, 0.35, 0.08, 1)
        local lbl = btn:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        lbl:SetAllPoints()
        lbl:SetJustifyH("CENTER")
        lbl:SetText(page.title ~= "" and page.title or ("Phase " .. i))
        local idx = i
        btn:SetScript("OnClick", function() SelectPage(idx) end)
        RPV.tabButtons[i] = btn
        x = x + 74
    end
end

-- ── Load plan ────────────────────────────────────────────────────────────────
function RPV.LoadPlan(plan)
    RPV.plan    = plan
    RPV.pageIdx = 1
    RPV.BuildPhaseTabs()
    RPV.Animation.SetPage(1)
    RPV.Renderer.BuildPage(plan.pages[1])
    RPV.Animation.Play()
    playBtn:SetText("Pause")
    mainFrame:Show()
end

-- ── Play / Pause ─────────────────────────────────────────────────────────────
playBtn:SetScript("OnClick", function()
    if RPV.Animation.IsPlaying() then
        RPV.Animation.Pause()
        playBtn:SetText("Play")
    else
        RPV.Animation.Play()
        playBtn:SetText("Pause")
    end
end)

-- ── Slash command ────────────────────────────────────────────────────────────
SLASH_RAIDPLAN1 = "/raidplan"
SlashCmdList["RAIDPLAN"] = function()
    if mainFrame:IsShown() then
        mainFrame:Hide()
    else
        RPV.ShowImport()
    end
end
