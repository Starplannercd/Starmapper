-- Standard base64 decoder
RaidPlanViewer = RaidPlanViewer or {}

local CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local lookup = {}
for i = 1, #CHARS do
    lookup[CHARS:sub(i, i)] = i - 1
end

function RaidPlanViewer.Base64Decode(s)
    s = s:gsub("[^A-Za-z0-9+/=]", "")  -- strip whitespace/newlines
    local out = {}
    local i = 1
    while i <= #s do
        local c1 = lookup[s:sub(i,   i  )] or 0
        local c2 = lookup[s:sub(i+1, i+1)] or 0
        local c3 = lookup[s:sub(i+2, i+2)]
        local c4 = lookup[s:sub(i+3, i+3)]

        -- first byte: top 6 bits of c1 + top 2 bits of c2
        table.insert(out, string.char((c1 * 4) + math.floor(c2 / 16)))

        if s:sub(i+2, i+2) ~= "=" and c3 then
            -- second byte: bottom 4 bits of c2 + top 4 bits of c3
            table.insert(out, string.char(((c2 % 16) * 16) + math.floor(c3 / 4)))
        end

        if s:sub(i+3, i+3) ~= "=" and c4 then
            -- third byte: bottom 2 bits of c3 + all 6 bits of c4
            table.insert(out, string.char(((c3 % 4) * 64) + c4))
        end

        i = i + 4
    end
    return table.concat(out)
end
