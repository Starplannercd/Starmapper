RaidPlanViewer = RaidPlanViewer or {}
local RPV = RaidPlanViewer

RPV.CANVAS_W       = 1024
RPV.CANVAS_H       = 584
RPV.FRAME_DURATION = 2.0    -- seconds per keyframe segment (matches web app)
RPV.TOKEN_SIZE     = 34     -- in-game pixels for a player token
RPV.MARKER_SIZE    = 30

-- Class icon textures available natively in WoW
RPV.ClassIcons = {
    deathknight = "Interface\\Icons\\ClassIcon_DeathKnight",
    druid       = "Interface\\Icons\\ClassIcon_Druid",
    hunter      = "Interface\\Icons\\ClassIcon_Hunter",
    mage        = "Interface\\Icons\\ClassIcon_Mage",
    monk        = "Interface\\Icons\\ClassIcon_Monk",
    paladin     = "Interface\\Icons\\ClassIcon_Paladin",
    priest      = "Interface\\Icons\\ClassIcon_Priest",
    rogue       = "Interface\\Icons\\ClassIcon_Rogue",
    shaman      = "Interface\\Icons\\ClassIcon_Shaman",
    warlock     = "Interface\\Icons\\ClassIcon_Warlock",
    warrior     = "Interface\\Icons\\ClassIcon_Warrior",
    -- generic roles
    tank        = "Interface\\Icons\\Ability_Warrior_DefensiveStance",
    healer      = "Interface\\Icons\\Spell_Holy_WordSanctuary",
    melee       = "Interface\\Icons\\Ability_DualWield",
    ranged      = "Interface\\Icons\\INV_Weapon_Bow_07",
    -- enemies
    add         = "Interface\\Icons\\Ability_Rogue_Shadowstep",
}

-- WoW's built-in raid target marker textures (1=star … 8=skull)
RPV.MarkerIndex = {
    star     = 1,
    circle   = 2,
    diamond  = 3,
    triangle = 4,
    moon     = 5,
    square   = 6,
    cross    = 7,
    skull    = 8,
}

-- Parse "#rrggbb" hex colour into r,g,b (0-1 floats)
function RPV.HexToRGB(hex)
    hex = hex and hex:gsub("#", "") or "ffffff"
    if #hex < 6 then return 1, 1, 1 end
    local r = tonumber(hex:sub(1,2), 16) / 255
    local g = tonumber(hex:sub(3,4), 16) / 255
    local b = tonumber(hex:sub(5,6), 16) / 255
    return r, g, b
end
