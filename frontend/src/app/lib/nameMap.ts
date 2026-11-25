// 2027 완전 비식별 모드: 학생 실명은 서버에 없고 이 브라우저에만 있다.
// 담임이 오프라인 CSV(익명코드·학생코드·이름)를 한 번 올리면 PIN으로 만든 키(PBKDF2→AES-GCM)로 암호화해 저장한다.
// 공용 PC 모드면 localStorage 대신 sessionStorage(탭을 닫으면 사라짐)에 둔다. 서버로는 아무것도 보내지 않는다.
// 잠금을 풀면 이번 탭(sessionStorage)에서만 화면의 익명코드를 실명으로 바꿔 보여 준다.

const STORE = "pbst_name_map";
const OPEN = "pbst_name_map_open";
export const PUBLIC_PC = "pbst_public_pc";
export const ANON_RE = /K\d{2}-\d{3}/g;

function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }
const isPublicPc = () => safe(() => sessionStorage.getItem(PUBLIC_PC) === "1", false);
const store = (): Storage | null => safe(() => (isPublicPc() ? sessionStorage : localStorage), null);

const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function keyFrom(pin: string, salt: Uint8Array) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 200000, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** CSV → {익명코드: 이름}. 머리글에 익명코드(또는 student_code)·student_name(또는 이름)이 있어야 한다. */
export function parseMapCsv(text: string): Record<string, string> {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    const cells = (l: string) => l.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const hdr = cells(lines[0] || "");
    const ci = [hdr.indexOf("익명코드"), hdr.indexOf("student_code")].find(i => i >= 0) ?? -1;
    const ni = [hdr.indexOf("student_name"), hdr.indexOf("이름"), hdr.indexOf("학생이름")].find(i => i >= 0) ?? -1;
    if (ci < 0 || ni < 0) throw new Error("머리글에 '익명코드'와 'student_name' 칸이 있어야 합니다.");
    const out: Record<string, string> = {};
    for (const l of lines.slice(1)) {
        const c = cells(l), code = c[ci], name = c[ni];
        if (code && name && /^K\d{2}-\d{3}$/.test(code)) out[code] = name;
    }
    if (!Object.keys(out).length) throw new Error("익명코드(K27-000 꼴)와 이름이 함께 적힌 줄이 없습니다.");
    return out;
}

export async function saveMap(map: Record<string, string>, pin: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(pin, salt), new TextEncoder().encode(JSON.stringify(map)));
    store()?.setItem(STORE, JSON.stringify({ salt: b64(salt), iv: b64(iv), data: b64(data), n: Object.keys(map).length }));
    safe(() => sessionStorage.setItem(OPEN, JSON.stringify(map)), undefined);
}

export function savedCount(): number {
    return safe(() => JSON.parse(store()?.getItem(STORE) || "null")?.n || 0, 0);
}

export async function unlock(pin: string): Promise<boolean> {
    const raw = safe(() => JSON.parse(store()?.getItem(STORE) || "null"), null);
    if (!raw) return false;
    try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(raw.iv) }, await keyFrom(pin, unb64(raw.salt)), unb64(raw.data));
        sessionStorage.setItem(OPEN, new TextDecoder().decode(plain));
        return true;
    } catch { return false; }
}

export function openMap(): Record<string, string> | null {
    return safe(() => JSON.parse(sessionStorage.getItem(OPEN) || "null"), null);
}

export function lock() { safe(() => sessionStorage.removeItem(OPEN), undefined); }

export function clearMap() {
    lock();
    safe(() => { localStorage.removeItem(STORE); sessionStorage.removeItem(STORE); }, undefined);
}
