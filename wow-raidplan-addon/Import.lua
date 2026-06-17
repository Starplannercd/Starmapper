local RPV = RaidPlanViewer

-- ── Import dialog ──────────────────────────────────────────────────────────
local importFrame = CreateFrame("Frame", "RaidPlanImportFrame", UIParent)
importFrame:SetSize(480, 300)
importFrame:SetPoint("CENTER")
importFrame:SetMovable(true)
importFrame:EnableMouse(true)
importFrame:RegisterForDrag("LeftButton")
importFrame:SetScript("OnDragStart", importFrame.StartMoving)
importFrame:SetScript("OnDragStop",  importFrame.StopMovingOrSizing)
do
    local bg = importFrame:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetTexture("Interface\\Buttons\\WHITE8X8")
    bg:SetVertexColor(0.05, 0.04, 0.02, 0.97)
    local function edge(a1, a2, x1, y1, x2, y2)
        local t = importFrame:CreateTexture(nil, "BORDER")
        t:SetTexture("Interface\\Buttons\\WHITE8X8")
        t:SetVertexColor(0.65, 0.52, 0.18, 1)
        t:SetPoint(a1, importFrame, a1, x1, y1)
        t:SetPoint(a2, importFrame, a2, x2, y2)
    end
    edge("TOPLEFT","TOPRIGHT",0,0,0,1) edge("BOTTOMLEFT","BOTTOMRIGHT",0,-1,0,0)
    edge("TOPLEFT","BOTTOMLEFT",0,0,1,0) edge("TOPRIGHT","BOTTOMRIGHT",-1,0,0,0)
end
importFrame:SetFrameStrata("DIALOG")
importFrame:Hide()
tinsert(UISpecialFrames, "RaidPlanImportFrame")

-- Title
local titleStr = importFrame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
titleStr:SetPoint("TOP", importFrame, "TOP", 0, -12)
titleStr:SetText("Import Raid Plan")

-- Instructions
local instrStr = importFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
instrStr:SetPoint("TOPLEFT", importFrame, "TOPLEFT", 18, -32)
instrStr:SetPoint("TOPRIGHT", importFrame, "TOPRIGHT", -18, -32)
instrStr:SetText("Paste the string copied from the web app's 'Addon Export' button, then click Import.")
instrStr:SetJustifyH("LEFT")
instrStr:SetTextColor(0.75, 0.65, 0.45, 1)

-- EditBox (scrolling)
local scrollFrame = CreateFrame("ScrollFrame", "RPVImportScroll", importFrame, "UIPanelScrollFrameTemplate")
scrollFrame:SetPoint("TOPLEFT",     importFrame, "TOPLEFT",     14, -72)
scrollFrame:SetPoint("BOTTOMRIGHT", importFrame, "BOTTOMRIGHT", -32, 50)

local editBox = CreateFrame("EditBox", nil, scrollFrame)
editBox:SetMultiLine(true)
editBox:SetMaxLetters(0)
editBox:SetFontObject(ChatFontNormal)
editBox:SetWidth(scrollFrame:GetWidth())
editBox:SetAutoFocus(false)
editBox:SetScript("OnEscapePressed", function() importFrame:Hide() end)
editBox:SetScript("OnTextChanged", function(self)
    scrollFrame:SetScrollChild(self)
end)
scrollFrame:SetScrollChild(editBox)

-- Status label
local statusStr = importFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
statusStr:SetPoint("BOTTOMLEFT", importFrame, "BOTTOMLEFT", 18, 14)
statusStr:SetText("")

local function SetStatus(msg, isError)
    statusStr:SetText(msg)
    if isError then
        statusStr:SetTextColor(1, 0.3, 0.3, 1)
    else
        statusStr:SetTextColor(0.3, 1, 0.3, 1)
    end
end

-- Import button
local importBtn = CreateFrame("Button", nil, importFrame, "UIPanelButtonTemplate")
importBtn:SetSize(90, 22)
importBtn:SetPoint("BOTTOMRIGHT", importFrame, "BOTTOMRIGHT", -14, 12)
importBtn:SetText("Import")
importBtn:SetScript("OnClick", function()
    local raw = editBox:GetText()
    raw = raw:gsub("%s+", "")  -- strip all whitespace
    if raw == "" then
        SetStatus("Paste an export string first.", true)
        return
    end

    -- base64 decode
    local ok, decoded = pcall(RPV.Base64Decode, raw)
    if not ok or not decoded then
        SetStatus("Failed to decode — is this a valid export string?", true)
        return
    end

    -- JSON decode
    local plan, err = RPV.JsonDecode(decoded)
    if not plan then
        SetStatus("Failed to parse plan data: " .. tostring(err), true)
        return
    end

    if type(plan.pages) ~= "table" or #plan.pages == 0 then
        SetStatus("No pages found in this plan.", true)
        return
    end

    -- Persist to SavedVariables and load
    RaidPlanViewerDB = RaidPlanViewerDB or {}
    RaidPlanViewerDB.lastPlan = raw

    SetStatus("Loaded " .. #plan.pages .. " phase(s)!", false)
    RPV.LoadPlan(plan)
    importFrame:Hide()
end)

-- Close button
local closeBtn = CreateFrame("Button", nil, importFrame, "UIPanelCloseButton")
closeBtn:SetPoint("TOPRIGHT", importFrame, "TOPRIGHT", -2, -2)

-- ── Public ─────────────────────────────────────────────────────────────────
function RPV.ShowImport()
    editBox:SetText("")
    SetStatus("")

    -- Pre-fill with last import if available
    if RaidPlanViewerDB and RaidPlanViewerDB.lastPlan then
        editBox:SetText(RaidPlanViewerDB.lastPlan)
        SetStatus("Previous plan pre-loaded. Click Import to reload or paste a new one.")
    end

    importFrame:Show()
    editBox:SetFocus()
end

-- ── Auto-reload last plan on login ─────────────────────────────────────────
local loader = CreateFrame("Frame")
loader:RegisterEvent("PLAYER_LOGIN")
loader:SetScript("OnEvent", function()
    if RaidPlanViewerDB and RaidPlanViewerDB.lastPlan then
        local ok1, decoded = pcall(RPV.Base64Decode, RaidPlanViewerDB.lastPlan)
        if ok1 and decoded then
            local plan = RPV.JsonDecode(decoded)
            if plan and type(plan.pages) == "table" and #plan.pages > 0 then
                RPV.LoadPlan(plan)
                RPV.mainFrame:Hide()  -- load silently; player opens with /raidplan
            end
        end
    end
end)
