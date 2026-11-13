"""간이 hwpx 작성기 — 받은 양식(.hwpx)의 글꼴·스타일(header.xml)을 그대로 빌리고 본문(section0)만 새로 쓴다.
원본 XML 문자열 연산만 쓰고(etree 사용 안 함) mimetype 을 첫 엔트리·비압축으로 묶는다.
쓰는 스타일 번호(양식 header.xml 기준): char 1=10pt 바탕, 4=9pt 바탕, 9=15pt 굵게, 11=10pt 굵게 돋움, 15=9pt 맑은, 18=9pt 굵게 맑은
                                         para 0=양쪽 160%, 2/3/4=들여쓰기 1000/2000/3000, 11=왼쪽 130%, 22=가운데 160%, 23=가운데 130%
                                         borderFill 3=실선, 6=회색 머리, 8=회색 상자
"""
import io, re, struct, zlib, zipfile
from xml.sax.saxutils import escape

W = 48188  # 본문 폭(A4, 좌우 여백 20mm)


class Doc:
    def __init__(self, template_path: str, title: str):
        with zipfile.ZipFile(template_path) as z:
            self.entries = [(i.filename, z.read(i.filename), i.compress_type) for i in z.infolist()]
        sec = next(d for n, d, _ in self.entries if n == "Contents/section0.xml").decode("utf8")
        end = sec.index("</hp:run>", sec.index("</hp:secPr>")) + len("</hp:run>")
        head_end = sec.index("<hs:sec")
        ns_end = sec.index(">", head_end) + 1
        self.prefix = sec[:ns_end]  # xml 선언 + 네임스페이스
        # 첫 문단(구역 설정 secPr 포함)은 원본에서 그대로 가져오고 글자·줄 정보만 비운다
        p_start = sec.index("<hp:p ", ns_end)
        first = sec[p_start:end] + "</hp:p>"
        self.first = first
        self.title = title
        self.body: list[str] = []
        self._id = 1000000000

    def nid(self):
        self._id += 1
        return self._id

    # ── 문단 ──
    def p(self, text="", char=1, para=0):
        t = f"<hp:t>{escape(text)}</hp:t>" if text else ""
        return (f'<hp:p id="{self.nid()}" paraPrIDRef="{para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
                f'<hp:run charPrIDRef="{char}">{t}</hp:run></hp:p>')

    def add(self, xml): self.body.append(xml)
    def title_(self, text): self.add(self.p(text, 9, 22)); self.add(self.p())
    def sub(self, text): self.add(self.p(text, 4, 22))
    def text(self, t, level=0): self.add(self.p(t, 1, {0: 0, 1: 2, 2: 3, 3: 4}[level]))
    def note(self, t): self.add(self.p("※ " + t, 4, 0))
    def gap(self): self.add(self.p())
    def pagebreak(self):
        self.add(f'<hp:p id="{self.nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"><hp:run charPrIDRef="1"/></hp:p>')

    # ── 표 ──
    def _cell(self, lines, w, r, c, span, head, fill, char, para):
        paras = "".join(self.p(l, char, para) for l in (lines if isinstance(lines, list) else str(lines).split("\n")))
        chars = max((len(l) for l in (lines if isinstance(lines, list) else str(lines).split("\n"))), default=1)
        per = max(1, int((w - 1020) / (900 if char in (4, 15, 18) else 1000)))
        nlines = sum(max(1, -(-len(l) // per)) for l in (lines if isinstance(lines, list) else str(lines).split("\n")))
        h = max(1500, nlines * 1450 + 400)
        return (f'<hp:tc name="" header="{1 if head else 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="{fill}">'
                f'<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{paras}</hp:subList>'
                f'<hp:cellAddr colAddr="{c}" rowAddr="{r}"/><hp:cellSpan colSpan="{span}" rowSpan="1"/><hp:cellSz width="{w}" height="{h}"/>'
                f'<hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>'), h

    def table(self, widths, rows, header=True, fill_first_col=False, center_cols=()):
        """widths: 열 비율 목록. rows: 행 목록(각 셀은 문자열 또는 (문자열, colspan)). 첫 행을 머리글로 쓴다."""
        tot = sum(widths)
        ws = [int(W * x / tot) for x in widths]
        ws[-1] = W - sum(ws[:-1])
        trs, total_h = [], 0
        for ri, row in enumerate(rows):
            cells, col, rh = [], 0, 0
            for cell in row:
                text, span = (cell if isinstance(cell, tuple) else (cell, 1))
                w = sum(ws[col:col + span])
                head = header and ri == 0
                fill = 6 if head or (fill_first_col and col == 0) else 3
                al = 23 if head or col in center_cols else 11
                xml, h = self._cell(text, w, ri, col, span, head, fill, 18 if head else 4, al)
                cells.append(xml); rh = max(rh, h); col += span
            # 같은 행의 칸 높이를 맞춘다
            cells = [re.sub(r'(<hp:cellSz width="\d+" height=")\d+', rf'\g<1>{rh}', x) for x in cells]
            trs.append("<hp:tr>" + "".join(cells) + "</hp:tr>")
            total_h += rh
        ncol = len(ws)
        tbl = (f'<hp:tbl id="{self.nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="{1 if header else 0}" rowCnt="{len(rows)}" colCnt="{ncol}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">'
               f'<hp:sz width="{W}" widthRelTo="ABSOLUTE" height="{total_h}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="141" right="141" top="141" bottom="141"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
               + "".join(trs) + "</hp:tbl>")
        self.add(f'<hp:p id="{self.nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1">{tbl}<hp:t/></hp:run></hp:p>')
        self.gap()

    def heading(self, text):
        """장 제목: 회색 한 칸 표."""
        w = W
        cell, h = self._cell([text], w, 0, 0, 1, False, 6, 11, 11)
        cell = cell.replace('header="0"', 'header="0"')
        tbl = (f'<hp:tbl id="{self.nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="3" noAdjust="0">'
               f'<hp:sz width="{w}" widthRelTo="ABSOLUTE" height="{h}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="141" right="141" top="141" bottom="141"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
               f"<hp:tr>{cell}</hp:tr></hp:tbl>")
        self.add(f'<hp:p id="{self.nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1">{tbl}<hp:t/></hp:run></hp:p>')

    def code(self, lines):
        """의사코드 상자(회색, 9pt 맑은 고딕)."""
        cell, h = self._cell(lines, W, 0, 0, 1, False, 8, 15, 11)
        tbl = (f'<hp:tbl id="{self.nid()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="3" noAdjust="0">'
               f'<hp:sz width="{W}" widthRelTo="ABSOLUTE" height="{h}" heightRelTo="ABSOLUTE" protect="0"/>'
               '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
               '<hp:outMargin left="141" right="141" top="141" bottom="141"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
               f"<hp:tr>{cell}</hp:tr></hp:tbl>")
        self.add(f'<hp:p id="{self.nid()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="1">{tbl}<hp:t/></hp:run></hp:p>')
        self.gap()

    # ── 저장 ──
    def save(self, out_path: str):
        first = re.sub(r'<hp:t>.*?</hp:t>', '', self.first)           # 원본 첫 문단의 글자 제거(구역 설정만 남김)
        first = re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>', '', first)
        sec = self.prefix + first + "".join(self.body) + "</hs:sec>"
        plain = re.sub(r"<[^>]+>", " ", "".join(self.body))
        preview = (self.title + "\n" + re.sub(r"\s+", " ", plain)[:900]).encode("utf8")
        hpf = None
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            order = sorted(self.entries, key=lambda e: 0 if e[0] == "mimetype" else 1)
            for name, data, ctype in order:
                if name == "Contents/section0.xml":
                    data = sec.encode("utf8")
                elif name == "Preview/PrvText.txt":
                    data = preview
                elif name == "Preview/PrvImage.png":
                    data = _blank_png()
                elif name == "Contents/content.hpf":
                    s = data.decode("utf8")
                    s = re.sub(r"<opf:title>.*?</opf:title>", f"<opf:title>{escape(self.title)}</opf:title>", s)
                    s = re.sub(r'(<opf:meta name="creator" content="text">).*?(</opf:meta>)', r"\1경은PBS\2", s)
                    s = re.sub(r'(<opf:meta name="lastsaveby" content="text">).*?(</opf:meta>)', r"\1경은PBS\2", s)
                    data = s.encode("utf8")
                zi = zipfile.ZipInfo(name)
                zi.compress_type = zipfile.ZIP_STORED if name == "mimetype" else (ctype or zipfile.ZIP_DEFLATED)
                z.writestr(zi, data)
        with open(out_path, "wb") as f:
            f.write(buf.getvalue())


def _blank_png(w=96, h=136):
    raw = b"".join(b"\x00" + b"\xff\xff\xff" * w for _ in range(h))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
