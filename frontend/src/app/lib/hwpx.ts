// 한글(HWPX) 내려받기 — 브라우저 안에서 만든다(인쇄용 실명이 서버로 가지 않게).
// 글꼴·테두리·회색 머리칸은 학교 양식(위기행동 보고서 템플릿)의 스타일을 그대로 쓴다: public/hwpx-base/.
// 화면에 그려진 문서(표·문단)를 읽어 표는 한글 표로, 나머지는 문단으로 옮긴다.

export type Cell = { text: string; head?: boolean; cs?: number; rs?: number };
export type Block = { t: "p"; text: string; bold?: boolean } | { t: "table"; cols: number[]; rows: Cell[][] };

const BASE = "/hwpx-base/";
const FILES: [string, string][] = [
    ["mimetype", "mimetype"], ["version.xml", "version.xml"], ["Contents/header.xml", "Contents__header.xml"],
    ["settings.xml", "settings.xml"], ["META-INF/container.rdf", "META-INF__container.rdf"], ["Contents/content.hpf", "Contents__content.hpf"],
    ["META-INF/container.xml", "META-INF__container.xml"], ["META-INF/manifest.xml", "META-INF__manifest.xml"],
];
// 템플릿 스타일 번호: 글자(29 제목 17pt 굵게, 49 머리칸 9pt 굵게, 50 본문 9pt) · 문단(22 가운데, 21 가운데, 24 왼쪽) · 테두리(9 회색칸, 11 실선)
const ST = { title: 29, headChar: 49, bodyChar: 50, center: 22, headPara: 21, bodyPara: 24, headFill: 9, bodyFill: 11, tblFill: 5 };
const PAGE_W = 50830; // 템플릿 표 너비(HWPUNIT)

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const para = (text: string, paraPr: number, charPr: number) =>
    `<hp:p id="2147483648" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${charPr}">${text ? `<hp:t>${esc(text)}</hp:t>` : ""}</hp:run></hp:p>`;
const lines = (text: string, paraPr: number, charPr: number) => (text.replace(/\r/g, "").split("\n").map(l => para(l, paraPr, charPr)).join("") || para("", paraPr, charPr));

let tblId = 1000;
function table(b: Extract<Block, { t: "table" }>): string {
    const ncol = b.cols.length;
    const sum = b.cols.reduce((a, x) => a + x, 0) || 1;
    const w = b.cols.map(x => Math.round((x / sum) * PAGE_W));
    // 병합 칸을 고려해 칸마다 실제 열 위치를 정한다
    const busy: boolean[][] = [];
    const rowsXml = b.rows.map((row, r) => {
        busy[r] = busy[r] || [];
        let c = 0;
        const cells = row.map(cell => {
            while (busy[r][c]) c++;
            const cs = Math.max(1, Math.min(cell.cs || 1, ncol - c)), rs = Math.max(1, cell.rs || 1);
            for (let i = 0; i < rs; i++) { busy[r + i] = busy[r + i] || []; for (let j = 0; j < cs; j++) busy[r + i][c + j] = true; }
            const width = w.slice(c, c + cs).reduce((a, x) => a + x, 0);
            const xml = `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${cell.head ? ST.headFill : ST.bodyFill}">`
                + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${cell.head ? "CENTER" : "TOP"}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
                + lines(cell.text, cell.head ? ST.headPara : ST.bodyPara, cell.head ? ST.headChar : ST.bodyChar)
                + `</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/>`
                + `<hp:cellSz width="${width}" height="1000"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
            c += cs;
            return xml;
        }).join("");
        return `<hp:tr>${cells}</hp:tr>`;
    }).join("");
    const nrow = b.rows.length;
    return `<hp:tbl id="${tblId++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${nrow}" colCnt="${ncol}" cellSpacing="0" borderFillIDRef="${ST.tblFill}" noAdjust="0">`
        + `<hp:sz width="${PAGE_W}" widthRelTo="ABSOLUTE" height="${nrow * 1000}" heightRelTo="ABSOLUTE" protect="0"/>`
        + `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
        + `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${rowsXml}</hp:tbl>`;
}

export function sectionXml(head: string, title: string, blocks: Block[]): string {
    const body = blocks.map(b => b.t === "table"
        ? `<hp:p id="2147483648" paraPrIDRef="${ST.bodyPara}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${ST.bodyChar}">${table(b)}<hp:t/></hp:run></hp:p>`
        : lines(b.text, ST.bodyPara, b.bold ? ST.headChar : ST.bodyChar)).join("");
    // head는 첫 문단(쪽 설정) 앞부분이다. 제목을 그 문단에 넣고 닫는다.
    return `${head}<hp:run charPrIDRef="${ST.title}"><hp:t>${esc(title)}</hp:t></hp:run></hp:p>${body}</hs:sec>`;
}

// ── 화면 문서 → 블록 ─────────────────────────────────────
// 인쇄 원본은 화면에서 숨겨져 있어 innerText가 비므로 직접 읽는다: <br>·블록 요소는 줄바꿈, 줄 안 요소는 띄어쓰기
const BLOCK = new Set(["DIV", "P", "LI", "TR", "H1", "H2", "H3", "TABLE", "UL", "OL"]);
function raw(el: Node): string {
    let out = "";
    el.childNodes.forEach(n => {
        if (n.nodeType === 3) { out += (n as Text).data; return; }
        if (n.nodeType !== 1) return;
        const e = n as HTMLElement;
        if (e.classList.contains("no-print")) return;
        if (e.tagName === "BR") { out += "\n"; return; }
        if (e.tagName === "TEXTAREA" || e.tagName === "INPUT" || e.tagName === "SELECT") { out += (e as HTMLInputElement).value || ""; return; }
        const inner = raw(e);
        out += BLOCK.has(e.tagName) ? `\n${inner}\n` : e.tagName === "SPAN" || e.tagName === "TD" || e.tagName === "TH" ? `${inner} ` : inner;
    });
    return out;
}
const txt = (el: HTMLElement) => raw(el).replace(/ /g, " ").split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
function tableBlock(t: HTMLTableElement): Block {
    const cols = Array.from(t.querySelectorAll(":scope > colgroup > col")).map(c => parseFloat((c as HTMLElement).style.width) || 1);
    const rows: Cell[][] = Array.from(t.rows).map(tr => Array.from(tr.cells).map(td => ({
        text: txt(td), head: td.tagName === "TH", cs: td.colSpan || 1, rs: td.rowSpan || 1,
    })));
    const ncol = Math.max(cols.length, ...rows.map(r => r.reduce((n, c) => n + (c.cs || 1), 0)));
    return { t: "table", cols: cols.length === ncol ? cols : Array(ncol).fill(1), rows };
}
export function domToBlocks(root: HTMLElement): { title: string; blocks: Block[] } {
    let title = "";
    const blocks: Block[] = [];
    const walk = (el: Element) => {
        const h = el as HTMLElement;
        if (h.classList?.contains("no-print") || h.style?.display === "none") return;
        if (el.tagName === "H1" && !title) { title = txt(h); return; }
        if (el.tagName === "TABLE") { blocks.push(tableBlock(el as HTMLTableElement)); return; }
        if (!el.querySelector("table, h1")) { const s = txt(h); if (s) blocks.push({ t: "p", text: s }); return; }
        Array.from(el.children).forEach(walk);
    };
    Array.from(root.children).forEach(walk);
    return { title, blocks };
}

// ── 비압축 ZIP(STORED) ───────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zipStored(files: { name: string; data: Uint8Array }[]): Blob {
    const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
    let off = 0;
    for (const f of files) {
        const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
        lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, name.length, true);
        parts.push(new Uint8Array(lh.buffer), name, f.data);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
        ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
        central.push(new Uint8Array(ch.buffer), name);
        off += 30 + name.length + n;
    }
    const csize = central.reduce((a, x) => a + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/hwp+zip" });
}

export async function buildHwpx(title: string, blocks: Block[]): Promise<Blob> {
    const get = async (f: string) => new Uint8Array(await (await fetch(BASE + f)).arrayBuffer());
    const [base, head] = await Promise.all([Promise.all(FILES.map(([, f]) => get(f))), fetch(BASE + "section_head.xml").then(r => r.text())]);
    const files = FILES.map(([name], i) => ({ name, data: base[i] }));
    files.splice(3, 0, { name: "Contents/section0.xml", data: new TextEncoder().encode(sectionXml(head, title, blocks)) });
    return zipStored(files);
}

export function saveBlob(blob: Blob, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[\\/:*?"<>|]/g, "") + ".hwpx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 화면에 그려진 문서 한 덩어리를 그대로 한글 파일로
export async function downloadHwpxFromDom(root: HTMLElement, filename: string, fallbackTitle = "") {
    const { title, blocks } = domToBlocks(root);
    saveBlob(await buildHwpx(title || fallbackTitle, blocks), filename);
}
