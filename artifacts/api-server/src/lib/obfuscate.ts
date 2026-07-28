/**
 * Simple but effective Lua obfuscator.
 * Encodes the entire script as a byte array with XOR key, then wraps in a
 * Lua loader that decodes and executes at runtime.
 */
export function obfuscateLua(code: string): string {
  if (!code.trim()) return code;

  const key = Math.floor(Math.random() * 90) + 10; // 10–99
  const bytes = Array.from(Buffer.from(code, "utf8")).map((b) => (b + key) % 256);

  const lines = [
    `-- [[ LuaBox Protected ]] --`,
    `local _k=${key}`,
    `local _b={${bytes.join(",")}}`,
    `local _s=""`,
    `for _i=1,#_b do`,
    `  local _v=_b[_i]-_k`,
    `  if _v<0 then _v=_v+256 end`,
    `  _s=_s..string.char(_v)`,
    `end`,
    `local _f,_e=load(_s)`,
    `if _f then return _f() else error(_e) end`,
  ];

  return lines.join("\n");
}
