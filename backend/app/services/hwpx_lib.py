# -*- coding: utf-8 -*-
"""hwpxlib — HWPX(한글) 바이트 보존 편집 코어.
원본 XML을 문자열 연산으로만 수정한다(etree.tostring 사용 금지 → 한컴 호환 유지).
mimetype은 항상 첫 엔트리·비압축(STORED)으로 재패키징한다.
"""
import re, zipfile, io, shutil, os

def read_hwpx(path):
    """원본 zip을 순서·압축방식 보존하여 읽는다.
    반환: entries = [ {name, data(bytes), ctype} ...] (원래 순서)"""
    entries=[]
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            entries.append({"name":info.filename,
                            "data":z.read(info.filename),
                            "ctype":info.compress_type})
    return entries

def write_hwpx(entries, out_path):
    """mimetype 먼저·STORED, 나머지는 원 압축방식으로 재패키징."""
    order=sorted(entries, key=lambda e: 0 if e["name"]=="mimetype" else 1)
    if os.path.exists(out_path):
        try: os.remove(out_path)
        except: pass
    with zipfile.ZipFile(out_path,"w") as z:
        for e in order:
            ct = zipfile.ZIP_STORED if e["name"]=="mimetype" else (e["ctype"] or zipfile.ZIP_DEFLATED)
            zi=zipfile.ZipInfo(e["name"])
            zi.compress_type=ct
            z.writestr(zi, e["data"])
    return out_path

def sections(entries):
    """Contents/sectionN.xml 엔트리 목록(정렬)."""
    ss=[e for e in entries if re.match(r'Contents/section\d+\.xml$', e["name"])]
    return sorted(ss, key=lambda e:e["name"])

def _dec(b): return b.decode("utf-8")
def _enc(s): return s.encode("utf-8")

def replace_text(entries, mapping, count=0):
    """모든 섹션에서 문자열 치환(플레이스홀더 채움). mapping: {찾을문자열: 바꿀문자열}.
    반환: 총 치환 횟수."""
    total=0
    for e in sections(entries):
        x=_dec(e["data"]); before=x
        for k,v in mapping.items():
            x=x.replace(k, _xml_escape(v)) if not _looks_escaped(k) else x.replace(k, _xml_escape(v))
        if x!=before:
            e["data"]=_enc(x); total+=1
    return total

def _xml_escape(s):
    return (str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;"))

def _looks_escaped(s): return False

def set_checkbox(entries, name, checked=True):
    """이름(name=)으로 hp:checkBtn의 value를 CHECKED/UNCHECKED로 설정."""
    val="CHECKED" if checked else "UNCHECKED"
    pat=re.compile(r'(<hp:checkBtn\b[^>]*\bname="'+re.escape(name)+r'"[^>]*\bvalue=")(CHECKED|UNCHECKED)(")')
    n=0
    for e in sections(entries):
        x=_dec(e["data"])
        x,c=pat.subn(lambda m:m.group(1)+val+m.group(3), x)
        # value가 name보다 앞에 올 수도 있으므로 역순 패턴도 시도
        if c==0:
            pat2=re.compile(r'(<hp:checkBtn\b[^>]*\bvalue=")(CHECKED|UNCHECKED)("[^>]*\bname="'+re.escape(name)+r'")')
            x,c=pat2.subn(lambda m:m.group(1)+val+m.group(3), x)
        if c: e["data"]=_enc(x); n+=c
    return n

def list_checkboxes(entries):
    """(name, value) 목록."""
    out=[]
    for e in sections(entries):
        x=_dec(e["data"])
        for m in re.finditer(r'<hp:checkBtn\b[^>]*>', x):
            tag=m.group(0)
            nm=re.search(r'\bname="([^"]*)"',tag); vl=re.search(r'\bvalue="([^"]*)"',tag)
            out.append((nm.group(1) if nm else "", vl.group(1) if vl else ""))
    return out

def find_placeholders(entries, pattern=r'\{\{([^}]+)\}\}'):
    """{{...}} 형태 플레이스홀더 수집."""
    found=set()
    for e in sections(entries):
        for m in re.finditer(pattern, _dec(e["data"])):
            found.add(m.group(0))
    return sorted(found)

def table_grid(xml):
    """섹션 XML에서 표를 행×열 텍스트 격자로 추출(분석용)."""
    from xml.etree import ElementTree as ET
    P="{http://www.hancom.co.kr/hwpml/2011/paragraph}"
    root=ET.fromstring(xml)
    grids=[]
    for tbl in root.iter(P+"tbl"):
        rows=[]
        for tr in tbl.iter(P+"tr"):
            cells=[]
            for tc in tr.findall(P+"tc"):
                txt="".join(t.text or "" for t in tc.iter(P+"t"))
                nch=len(list(tc.iter(P+"checkBtn")))
                cells.append(("[체크박스]" if nch else "")+txt.strip())
            rows.append(cells)
        grids.append(rows)
    return grids

def fill_after_label(entries, label, value, escape=True):
    """표에서 '라벨' 셀 바로 다음(오른쪽) 셀에 값을 채운다. 템플릿 준비 불필요.
    빈 셀(자기닫힘 run) / 빈 run / 기존 텍스트 run 모두 처리. 섹션당 첫 일치."""
    v=_xml_escape(value) if escape else value
    filled=0
    lpat='<hp:t>'+_xml_escape(label)+'</hp:t>'
    for e in sections(entries):
        x=_dec(e["data"])
        pos=x.find(lpat)
        if pos<0: continue
        tc=x.find('<hp:tc', pos+len(lpat))
        if tc<0: continue
        tcend=x.find('</hp:tc>', tc)
        cell=x[tc:tcend]
        m=re.search(r'<hp:run\b([^>]*?)/>', cell)          # 자기닫힘 run(빈 셀)
        if m:
            cell2=cell[:m.start()]+'<hp:run'+m.group(1)+'><hp:t>'+v+'</hp:t></hp:run>'+cell[m.end():]
        else:
            m2=re.search(r'(<hp:run\b[^>]*>)(<hp:t>.*?</hp:t>)?', cell, re.S)
            if not m2: continue
            if m2.group(2):                                  # 기존 텍스트 교체
                cell2=cell[:m2.start(2)]+'<hp:t>'+v+'</hp:t>'+cell[m2.end(2):]
            else:                                            # 빈 open run
                cell2=cell[:m2.end(1)]+'<hp:t>'+v+'</hp:t>'+cell[m2.end(1):]
        e["data"]=_enc(x[:tc]+cell2+x[tcend:]); filled+=1
    return filled

# --- 진짜 체크박스(hp:checkBtn) 주입 ---
_CHECKBTN = ('<hp:checkBtn caption="" value="UNCHECKED" radioGroupName="" triState="0" '
 'backStyle="OPAQUE" name="{name}" foreColor="#000000" backColor="#FFFFFF" groupName="" '
 'tabStop="1" editable="1" tabOrder="{tab}" enabled="1" borderTypeIDRef="0" drawFrame="1" '
 'printable="1" command=""><hp:formCharPr charPrIDRef="0" followContext="0" autoSz="1" '
 'wordWrap="0"/><hp:sz width="1813" widthRelTo="ABSOLUTE" height="1450" heightRelTo="ABSOLUTE" '
 'protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="1" '
 'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" '
 'vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:checkBtn>')

def checkbox_run(options, name_start=100, char_pr="17"):
    """옵션 리스트 → '[체크박스]라벨 [체크박스]라벨 ...' 한 run(charPrIDRef=17) 문자열."""
    parts=[]
    for i,opt in enumerate(options):
        nm="CheckBox%d"%(name_start+i)
        parts.append(_CHECKBTN.format(name=nm, tab=-(name_start+i)))
        parts.append('<hp:t>'+_xml_escape(" "+opt+"  ")+'</hp:t>')
    return '<hp:run charPrIDRef="'+char_pr+'">'+''.join(parts)+'</hp:run>'

def put_checkboxes_after_label(entries, label, options, name_start=100):
    """'label' 셀 바로 다음 칸의 빈 run을 체크박스 run으로 교체. 섹션당 첫 일치."""
    lpat='<hp:t>'+_xml_escape(label)+'</hp:t>'
    done=0
    for e in sections(entries):
        x=_dec(e["data"]); pos=x.find(lpat)
        if pos<0: continue
        tc=x.find('<hp:tc', pos+len(lpat)); 
        if tc<0: continue
        tcend=x.find('</hp:tc>', tc); cell=x[tc:tcend]
        run=checkbox_run(options, name_start)
        m=re.search(r'<hp:run\b[^>]*?/>', cell)              # 자기닫힘 빈 run
        if m:
            cell2=cell[:m.start()]+run+cell[m.end():]
        else:
            m2=re.search(r'<hp:run\b[^>]*?>.*?</hp:run>', cell, re.S)  # 첫 run 뒤에 삽입
            if not m2: continue
            cell2=cell[:m2.end()]+run+cell[m2.end():]
        e["data"]=_enc(x[:tc]+cell2+x[tcend:]); done+=1
    return done

def cell_content_run(lead, options, name_start=200, char_pr="17"):
    """선택 리드텍스트 + '[체크박스]라벨' 시퀀스를 한 run으로."""
    parts=[]
    if lead: parts.append('<hp:t>'+_xml_escape(lead)+'</hp:t>')
    for i,opt in enumerate(options):
        parts.append(_CHECKBTN.format(name="CheckBox%d"%(name_start+i), tab=-(name_start+i)))
        parts.append('<hp:t>'+_xml_escape(" "+opt+"  ")+'</hp:t>')
    return '<hp:run charPrIDRef="'+char_pr+'">'+''.join(parts)+'</hp:run>'

def _cell_bounds(x, row, col):
    addr='<hp:cellAddr colAddr="%s" rowAddr="%s"/>'%(col,row)
    ap=x.find(addr)
    if ap<0: return None
    tc=x.rfind('<hp:tc', 0, ap)
    tcend=x.find('</hp:tc>', ap)
    return tc, tcend

def put_checkboxes_in_cell(entries, row, col, options, name_start, lead=""):
    """표의 (rowAddr,colAddr) 셀 안 빈 run을 리드텍스트+체크박스 run으로 교체."""
    for e in sections(entries):
        x=_dec(e["data"])
        b=_cell_bounds(x,row,col)
        if not b: continue
        tc,tcend=b; cell=x[tc:tcend]
        run=cell_content_run(lead, options, name_start)
        m=re.search(r'<hp:run\b[^>]*?/>', cell)
        if m:
            cell2=cell[:m.start()]+run+cell[m.end():]
        else:
            m2=re.search(r'<hp:run\b[^>]*?>.*?</hp:run>', cell, re.S)
            if m2: cell2=cell[:m2.start()]+run+cell[m2.end():]
            else:
                mp=re.search(r'<hp:p\b[^>]*>', cell)
                if not mp: return False
                cell2=cell[:mp.end()]+run+cell[mp.end():]
        e["data"]=_enc(x[:tc]+cell2+x[tcend:])
        return True
    return False


# ===================== v2: 범용 편집 (run 쪼개짐·병합셀·좌표 대응) =====================
# 실제 한글 문서는 "{{학생명}}"이나 "성명" 같은 글자가 여러 <hp:t>/<hp:run>으로 쪼개져 있고,
# 표는 병합셀·중첩표가 흔하다. v1의 문자열 매칭이 일부 문서에서만 되던 이유가 이것이다.
_UN = (("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&amp;", "&"))

def _unesc(s):
    for a, b in _UN: s = s.replace(a, b)
    return s

def _esc_t(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

_T_RE = re.compile(r'(<hp:t(?:\s[^>]*)?>)(.*?)(</hp:t>)', re.S)
_TAG_RE = re.compile(r'<[^>]+>')
_PTAG = re.compile(r'<hp:p\b[^>]*?(/?)>|</hp:p>')

def _para_spans(x):
    """모든 hp:p 의 (start, end, [자식 문단 span]) — 중첩(표 안 문단) 지원."""
    stack, out = [], []
    for m in _PTAG.finditer(x):
        if m.group(0).startswith("</"):
            s, kids = stack.pop()
            out.append((s, m.end(), kids))
            if stack: stack[-1][1].append((s, m.end()))
        elif m.group(1) != "/":
            stack.append((m.start(), []))
    return sorted(out)

def _own_t_matches(x, s, e, kids):
    """문단 [s,e) 중 자식 문단 밖에 있는 <hp:t> 매치들."""
    res = []
    for m in _T_RE.finditer(x, s, e):
        if not any(a <= m.start() < b for a, b in kids): res.append(m)
    return res

def _tokens(inner):
    """<hp:t> 내부를 (is_text, str) 토큰으로. 자식 태그(lineBreak 등)는 길이 0 취급."""
    toks, pos = [], 0
    for m in _TAG_RE.finditer(inner):
        if m.start() > pos: toks.append([True, _unesc(inner[pos:m.start()])])
        toks.append([False, m.group(0)]); pos = m.end()
    if pos < len(inner): toks.append([True, _unesc(inner[pos:])])
    return toks

def _para_text(x, s, e, kids):
    return "".join(t[1] for m in _own_t_matches(x, s, e, kids)
                   for t in _tokens(m.group(2)) if t[0])

def replace_text_v2(entries, mapping):
    """문단 단위 치환 — 찾을 글자가 여러 run/t로 쪼개져 있어도 치환한다.
    서식은 매치가 시작되는 run의 것을 따른다. 반환: 총 치환 횟수."""
    total = 0
    for e in sections(entries):
        x = _dec(e["data"]); edits = []
        for s, en, kids in _para_spans(x):
            ms = _own_t_matches(x, s, en, kids)
            if not ms: continue
            tmap = [_tokens(m.group(2)) for m in ms]
            flat = [(ti, ki) for ti, toks in enumerate(tmap) for ki, t in enumerate(toks) if t[0]]
            full = "".join(tmap[ti][ki][1] for ti, ki in flat)
            hits = []
            for k, v in mapping.items():
                if not k: continue
                i = full.find(k)
                while i >= 0:
                    hits.append((i, i + len(k), str(v))); i = full.find(k, i + len(k))
            if not hits: continue
            hits.sort(); clean, last = [], 0
            for h in hits:                      # 겹치는 매치 제거
                if h[0] >= last: clean.append(h); last = h[1]
            lens0 = [len(tmap[ti][ki][1]) for ti, ki in flat]
            offs = [sum(lens0[:i]) for i in range(len(flat))]
            owner = []                          # 전체 글자 위치 → flat 인덱스
            for fi, n in enumerate(lens0): owner += [fi] * n
            for a, b, v in reversed(clean):     # 오른쪽 매치부터(왼쪽 offset 보존)
                first = owner[a]
                for fi in range(first, len(flat)):
                    o = offs[fi]
                    if o >= b and fi != first: break
                    lo, hi = max(a, o) - o, min(b, o + lens0[fi]) - o
                    if hi <= lo and fi != first: continue
                    t = tmap[flat[fi][0]][flat[fi][1]]
                    t[1] = t[1][:lo] + (v if fi == first else "") + t[1][hi:]
                total += 1
            for m, toks in zip(ms, tmap):
                new = "".join(_esc_t(t[1]) if t[0] else t[1] for t in toks)
                if new != m.group(2): edits.append((m.start(2), m.end(2), new))
        for a, b, new in sorted(edits, reverse=True):
            x = x[:a] + new + x[b:]
        e["data"] = _enc(x)
    return total

# ---------- 표 지도 ----------
_TBL = re.compile(r'<hp:tbl\b[^>]*>|</hp:tbl>|<hp:tc\b[^>]*>|</hp:tc>')

def table_map(x):
    """섹션 XML → 표 목록. 각 표: {start,end,cells:[{start,end,row,col,rs,cs,text}]}
    중첩표는 별도 표로, 셀은 자기 바로 위 표에만 속한다."""
    tables, tstack, cstack = [], [], []
    for m in _TBL.finditer(x):
        g = m.group(0)
        if g.startswith("<hp:tbl"):
            t = {"start": m.start(), "end": None, "cells": []}
            tables.append(t); tstack.append(t)
        elif g == "</hp:tbl>":
            tstack.pop()["end"] = m.end()
        elif g.startswith("<hp:tc"):
            cstack.append((m.start(), tstack[-1] if tstack else None))
        else:
            s, t = cstack.pop(); body = x[s:m.end()]
            a = body.rfind("<hp:cellAddr"); sp = body.rfind("<hp:cellSpan")
            ga = lambda tag, k, d="0": (re.search(k + r'="(\d+)"', body[tag:body.find(">", tag)]) or [0, d])[1] if tag >= 0 else d
            if t is None or a < 0: continue
            t["cells"].append({"start": s, "end": m.end(), "row": int(ga(a, "rowAddr")), "col": int(ga(a, "colAddr")),
                               "rs": int(ga(sp, "rowSpan", "1")), "cs": int(ga(sp, "colSpan", "1"))})
    for t in tables:
        for c in t["cells"]:
            body = x[c["start"]:c["end"]]
            c["text"] = " ".join(_unesc(_TAG_RE.sub("", mm.group(2))) for mm in _T_RE.finditer(body)).strip()
    return tables

def _find_cell(t, row, col):
    for c in t["cells"]:
        if c["row"] <= row < c["row"] + c["rs"] and c["col"] <= col < c["col"] + c["cs"]: return c
    return None

def _set_cell_xml(cell, value):
    """셀 첫 문단의 글자를 value로 교체(여러 줄은 lineBreak). 서식(charPr)은 첫 run 유지."""
    parts = _esc_t(str(value)).split("\n")
    inner = "<hp:lineBreak/>".join(parts)
    p0 = cell.find("<hp:p ")
    if p0 < 0: return cell
    p1 = cell.find("</hp:p>", p0)
    para = cell[p0:p1]
    para = re.sub(r'<hp:t(?:\s[^>]*)?>.*?</hp:t>|<hp:t\s*/>', "", para, flags=re.S)   # 기존 글자 제거
    para = re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>', "", para, flags=re.S)     # 줄배치 캐시 제거(한컴이 재계산)
    m = re.search(r'<hp:run\b([^>]*?)/>', para)
    if m: para = para[:m.start()] + "<hp:run" + m.group(1) + "><hp:t>" + inner + "</hp:t></hp:run>" + para[m.end():]
    else:
        m = re.search(r'<hp:run\b[^>]*>', para)
        if not m: return cell
        para = para[:m.end()] + "<hp:t>" + inner + "</hp:t>" + para[m.end():]
    return cell[:p0] + para + cell[p1:]

def fill_cell(entries, sec, tbl, row, col, value):
    """(섹션, 표번호, 행, 열) 좌표의 셀에 값. 병합셀이면 병합 영역 어디를 지정해도 된다."""
    ss = sections(entries)
    if sec >= len(ss): return 0
    x = _dec(ss[sec]["data"]); tm = table_map(x)
    if tbl >= len(tm): return 0
    c = _find_cell(tm[tbl], row, col)
    if not c: return 0
    ss[sec]["data"] = _enc(x[:c["start"]] + _set_cell_xml(x[c["start"]:c["end"]], value) + x[c["end"]:])
    return 1

def _norm(s): return re.sub(r"\s+", "", s)

def fill_label_v2(entries, label, value, direction="right", nth=1):
    """라벨이 든 셀을 찾아 오른쪽(right)/아래(below) 이웃 셀에 값을 넣는다.
    - 라벨은 공백 무시, 셀 전체와 같거나(우선) 포함하면 일치. nth: n번째 일치.
    - 병합셀은 span 만큼 건너뛴다. 오른쪽 끝이면 자동으로 아래 칸을 시도."""
    hit = 0
    for e in sections(entries):
        x = _dec(e["data"]); tm = table_map(x); found = []
        for t in tm:
            exact = [c for c in t["cells"] if _norm(c["text"]) == _norm(label)]
            part = [c for c in t["cells"] if _norm(label) in _norm(c["text"])] if not exact else []
            found += [(t, c) for c in (exact or part)]
        if len(found) < nth - hit: hit += len(found); continue
        t, c = found[nth - hit - 1]
        tgt = None
        if direction == "right": tgt = _find_cell(t, c["row"], c["col"] + c["cs"])
        if tgt is None: tgt = _find_cell(t, c["row"] + c["rs"], c["col"])
        if tgt is None: return 0
        e["data"] = _enc(x[:tgt["start"]] + _set_cell_xml(x[tgt["start"]:tgt["end"]], value) + x[tgt["end"]:])
        return 1
    return 0

def clone_row(entries, sec, tbl, row, times=1):
    """표의 row 행을 times번 복제해 바로 아래에 삽입(명단형 표 늘리기). rowAddr·rowCnt 갱신."""
    ss = sections(entries); x = _dec(ss[sec]["data"]); tm = table_map(x)
    t = tm[tbl]; cells = [c for c in t["cells"] if c["row"] == row]
    if not cells: return 0
    s = x.rfind("<hp:tr", 0, cells[0]["start"]); en = x.find("</hp:tr>", cells[-1]["end"]) + len("</hp:tr>")
    tr = x[s:en]
    def shift(block, by):
        return re.sub(r'rowAddr="(\d+)"', lambda m: 'rowAddr="%d"' % (int(m.group(1)) + by), block)
    # 아래 행들 rowAddr를 times만큼 밀기
    tail_start = en; tail_end = t["end"]
    tail = x[tail_start:tail_end]
    def bump(m):
        return 'rowAddr="%d"' % (int(m.group(1)) + times) if int(m.group(1)) > row else m.group(0)
    tail = re.sub(r'rowAddr="(\d+)"', bump, tail)
    new_rows = "".join(shift(tr, k) for k in range(1, times + 1))
    head = x[t["start"]:s]
    head = re.sub(r'(<hp:tbl\b[^>]*\browCnt=")(\d+)(")', lambda m: m.group(1) + str(int(m.group(2)) + times) + m.group(3), head, count=1)
    ss[sec]["data"] = _enc(x[:t["start"]] + head + x[s:en] + new_rows + tail + x[tail_end:])
    return times

def dump_text(entries):
    """문서 전체 글자(문단 단위) — 읽기/검증용."""
    out = []
    for e in sections(entries):
        x = _dec(e["data"])
        for s, en, kids in _para_spans(x):
            t = _para_text(x, s, en, kids)
            if t.strip(): out.append(t)
    return out
