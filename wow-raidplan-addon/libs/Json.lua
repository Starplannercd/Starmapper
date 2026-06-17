-- Minimal JSON decoder (decode only, no encode needed)
RaidPlanViewer = RaidPlanViewer or {}

local function skipWS(s, i)
    while i <= #s do
        local c = s:byte(i)
        if c == 32 or c == 9 or c == 10 or c == 13 then i = i + 1
        else break end
    end
    return i
end

local parseValue  -- forward declaration

local function parseString(s, i)
    i = i + 1  -- skip opening "
    local parts = {}
    while i <= #s do
        local c = s:sub(i, i)
        if c == '"' then
            return table.concat(parts), i + 1
        elseif c == "\\" then
            local e = s:sub(i+1, i+1)
            if     e == '"'  then parts[#parts+1] = '"'
            elseif e == "\\" then parts[#parts+1] = "\\"
            elseif e == "/"  then parts[#parts+1] = "/"
            elseif e == "n"  then parts[#parts+1] = "\n"
            elseif e == "t"  then parts[#parts+1] = "\t"
            elseif e == "r"  then parts[#parts+1] = "\r"
            elseif e == "b"  then parts[#parts+1] = "\b"
            elseif e == "f"  then parts[#parts+1] = "\f"
            elseif e == "u"  then
                -- unicode escape: consume 4 hex digits, approximate with ?
                local hex = s:sub(i+2, i+5)
                local cp  = tonumber(hex, 16) or 63
                if cp < 128 then
                    parts[#parts+1] = string.char(cp)
                else
                    parts[#parts+1] = "?"
                end
                i = i + 4
            end
            i = i + 2
        else
            parts[#parts+1] = c
            i = i + 1
        end
    end
    error("JSON: unterminated string")
end

local function parseNumber(s, i)
    local j = i
    if s:sub(j,j) == "-" then j = j + 1 end
    while j <= #s and s:sub(j,j):match("%d") do j = j + 1 end
    if j <= #s and s:sub(j,j) == "." then
        j = j + 1
        while j <= #s and s:sub(j,j):match("%d") do j = j + 1 end
    end
    if j <= #s and s:sub(j,j):match("[eE]") then
        j = j + 1
        if j <= #s and s:sub(j,j):match("[+%-]") then j = j + 1 end
        while j <= #s and s:sub(j,j):match("%d") do j = j + 1 end
    end
    return tonumber(s:sub(i, j-1)), j
end

local function parseArray(s, i)
    i = i + 1  -- skip [
    local result = {}
    i = skipWS(s, i)
    if s:sub(i,i) == "]" then return result, i + 1 end
    while true do
        local val; val, i = parseValue(s, i)
        result[#result+1] = val
        i = skipWS(s, i)
        local c = s:sub(i,i)
        if     c == "]" then return result, i + 1
        elseif c == "," then i = i + 1; i = skipWS(s, i)
        else error("JSON: expected , or ] at " .. i) end
    end
end

local function parseObject(s, i)
    i = i + 1  -- skip {
    local result = {}
    i = skipWS(s, i)
    if s:sub(i,i) == "}" then return result, i + 1 end
    while true do
        if s:sub(i,i) ~= '"' then error("JSON: expected key at " .. i) end
        local key; key, i = parseString(s, i)
        i = skipWS(s, i)
        if s:sub(i,i) ~= ":" then error("JSON: expected : at " .. i) end
        i = i + 1; i = skipWS(s, i)
        local val; val, i = parseValue(s, i)
        result[key] = val
        i = skipWS(s, i)
        local c = s:sub(i,i)
        if     c == "}" then return result, i + 1
        elseif c == "," then i = i + 1; i = skipWS(s, i)
        else error("JSON: expected , or } at " .. i) end
    end
end

parseValue = function(s, i)
    i = skipWS(s, i)
    local c = s:sub(i,i)
    if c == '"' then
        return parseString(s, i)
    elseif c == "{" then
        return parseObject(s, i)
    elseif c == "[" then
        return parseArray(s, i)
    elseif c == "t" then
        return true,  i + 4   -- "true"
    elseif c == "f" then
        return false, i + 5   -- "false"
    elseif c == "n" then
        return nil,   i + 4   -- "null"
    elseif c == "-" or c:match("%d") then
        return parseNumber(s, i)
    else
        error("JSON: unexpected char '" .. c .. "' at " .. i)
    end
end

function RaidPlanViewer.JsonDecode(s)
    local ok, result = pcall(parseValue, s, 1)
    if ok then return result end
    return nil, result  -- result is the error message on failure
end
