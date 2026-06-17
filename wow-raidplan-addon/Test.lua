-- Minimal load test
local btn = CreateFrame("Button", "RPVTestButton", UIParent, "UIPanelButtonTemplate")
btn:SetSize(140, 28)
btn:SetPoint("CENTER", UIParent, "CENTER", 0, 250)
btn:SetText("Raid Plan Viewer")
btn:SetMovable(true)
btn:EnableMouse(true)
btn:RegisterForDrag("LeftButton")
btn:SetScript("OnDragStart", btn.StartMoving)
btn:SetScript("OnDragStop",  btn.StopMovingOrSizing)
btn:SetScript("OnClick", function()
    DEFAULT_CHAT_FRAME:AddMessage("|cff00ff00[RaidPlan]|r Button clicked — addon is working!")
end)
btn:Show()

SLASH_RAIDPLAN1 = "/raidplan"
SlashCmdList["RAIDPLAN"] = function()
    DEFAULT_CHAT_FRAME:AddMessage("|cff00ff00[RaidPlan]|r Slash command works!")
end

DEFAULT_CHAT_FRAME:AddMessage("|cff00ff00[RaidPlan]|r Addon loaded successfully.")
