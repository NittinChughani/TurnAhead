"""Render honest dark-mode TurnAhead README screenshots with real Chromium.

Requires playwright (Python), Chromium and BeautifulSoup only for building fictional
fixtures. No Firebase connection is made, no real patient data is accessed.
The actual public page HTML/CSS is used; JavaScript is disabled in the screenshot browser.
Run: python scripts/render_previews.py
"""
from pathlib import Path
import tempfile
import base64
import re
from bs4 import BeautifulSoup
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
PUB=ROOT/'public'; OUT=ROOT/'docs/assets';OUT.mkdir(exist_ok=True,parents=True)

def fixture(page_name):
    soup=BeautifulSoup((PUB/page_name).read_text(encoding='utf-8'),'html.parser')
    soup.html['data-theme']='dark'
    # Restricted browsers may not navigate local files/localhost; embed exact CSS and logo pixels.
    for link in soup.select('link[rel="stylesheet"]'):link.decompose()
    styles=re.sub(r"@import\s+url\([^;]+;",'',(PUB/'styles.css').read_text(encoding='utf-8'))
    # The live website loads DM Sans/Manrope from Google Fonts. For offline previews
    # use the available Inter fallback to keep bold numbers and card geometry faithful.
    # A non-sticky header prevents a clipped title when the browser scrolls to a section.
    styles+='\n:root{--font:"Inter",Arial,sans-serif;--display:"Inter Display","Inter",Arial,sans-serif}\n.site-header{position:relative!important;top:0!important;transform:none!important}\n'
    tag=soup.new_tag('style');tag.string=styles;soup.head.append(tag)
    for image in soup.select('img[src^="./assets/"]'):
        source=PUB/image['src'][2:]
        mime='image/webp' if source.suffix=='.webp' else 'image/png'
        image['src']=f'data:{mime};base64,'+base64.b64encode(source.read_bytes()).decode('ascii')
    for script in soup.find_all('script'):script.decompose()
    # Browser-rendered with the repository's actual CSS (not a print/PDF engine).
    return soup

def put(s,id,value):
    node=s.select_one('#'+id)
    if not node:raise ValueError(f'Missing {id}')
    node.clear();node.append(str(value))

def markup(s,selector,html):
    node=s.select_one(selector)
    if not node:raise ValueError(f'Missing {selector}')
    node.clear();node.append(BeautifulSoup(html,'html.parser'))

def reveal(s,id):s.select_one('#'+id).attrs.pop('hidden',None)
def hide(s,id):s.select_one('#'+id)['hidden']=''
def clean_modals(s):
    for x in s.select('.modal-backdrop'):x.decompose()

def save_fixture(s,name,tmp):
    p=tmp/(name+'.html');p.write_text(str(s),encoding='utf-8');return p

with tempfile.TemporaryDirectory(dir=PUB,prefix='preview-fixtures-') as root_tmp:
    tmp=Path(root_tmp)
    fixtures={}
    s=fixture('index.html');fixtures['preview-home']=save_fixture(s,'preview-home',tmp)
    s=fixture('track.html');clean_modals(s);hide(s,'track-loading');reveal(s,'track-content')
    for id,val in [('sync-state','LIVE · SYNCED'),('track-code','PHY-009'),('track-queue','Example Clinic · Physiotherapy'),('track-patient','Ticket for Ms Demo Patient'),('track-visit','Visiting Dr. Nadia Ali · Room P-210'),('track-state','WAITING'),('ahead-label','PEOPLE AHEAD OF YOU'),('ahead-count','3'),('track-eta','12–18 min'),('track-eta-clock','Around 11:35 AM (PKT) · estimate only'),('track-serving','PHY-007'),('track-message','Your place updates as reception calls each patient.'),('progress-description','3 people ahead of you. Times can change; stay near reception.')]:put(s,id,val)
    fixtures['preview-patient']=save_fixture(s,'preview-patient',tmp)
    s=fixture('desk.html');clean_modals(s);hide(s,'login-view');hide(s,'verify-view');hide(s,'no-access-view');reveal(s,'dashboard');reveal(s,'staff-greeting')
    put(s,'staff-greeting','Ms Samira');put(s,'facility-heading','Example Clinic · demonstration dashboard')
    for id,val in [('stat-waiting','17'),('stat-active','2'),('stat-completed','28'),('activity-count','2 recent')]:put(s,id,val)
    markup(s,'#queue-tabs','<button class="queue-tab active">Physiotherapy</button><button class="queue-tab">Cardiology</button><button class="queue-tab">Laboratory</button>')
    markup(s,'#queue-detail','''<div class="queue-view"><div class="queue-topline"><div><strong>Physiotherapy</strong><small>PHY · 8 waiting across 2 doctors</small></div><span class="state-pill">● LIVE</span></div><button class="btn btn-small btn-outline" style="margin-top:12px">⏸ Pause department</button><div class="doctor-tabs"><button class="doctor-tab selected"><span>Avery Hassan</span><small>5 waiting · Available</small></button><button class="doctor-tab"><span>Nadia Ali</span><small>3 waiting · Available</small></button></div><div class="doctor-queue-heading"><div><span class="kicker">DOCTOR-SPECIFIC QUEUE</span><h3>Dr. Avery Hassan</h3><small>Room P-204</small></div><span class="state-pill">● ACCEPTING</span></div><div class="serving-box"><div><span>NOW SERVING</span><strong>PHY-007</strong><small>Called from Counter 2</small></div><span class="serving-symbol">↗</span></div><div class="queue-facts"><span><b>5</b> waiting for this doctor</span><span><b>14</b> completed</span><span><b>7 min</b> average</span></div><div class="queue-buttons"><button class="btn btn-primary">Call next ↗</button><button class="btn btn-positive">✓ Complete</button><button class="btn btn-danger">Skip</button><button class="btn btn-outline">⏸ Doctor break</button></div><p class="queue-caption">Independent doctor lines; synchronized actions across counters.</p></div>''')
    markup(s,'#recent-tickets','''<div class="activity-item"><div class="activity-token">PHY-009</div><div class="activity-main"><b>Ms Demo Patient · Physiotherapy</b><small>Dr. Nadia Ali · 11:17 AM</small></div><span class="activity-state">waiting</span></div><div class="activity-item"><div class="activity-token">PHY-008</div><div class="activity-main"><b>Mr Example Person · Physiotherapy</b><small>Dr. Avery Hassan · 11:14 AM</small></div><span class="activity-state">waiting</span></div>''')
    for opt in s.select('#counter-select option'):
        if opt.get('value')=='2':opt['selected']='selected'
        else:opt.attrs.pop('selected',None)
    fixtures['preview-reception']=save_fixture(s,'preview-reception',tmp)
    s=fixture('board.html');clean_modals(s);put(s,'board-time','11:17:45 AM');put(s,'board-facility','Example Clinic · Live queue overview')
    markup(s,'#board-grid','''<article class="board-card"><div class="board-card-top">Physiotherapy <span>LIVE</span></div><div class="board-card-middle"><small>NOW SERVING · 2 DOCTORS</small><div class="board-active-codes"><span class="board-code-chip"><b>PHY-007</b><small>Counter 2</small></span><span class="board-code-chip"><b>PHY-005</b><small>Counter 1</small></span></div></div><div class="board-card-bottom"><span>People waiting</span><b>8</b></div></article><article class="board-card"><div class="board-card-top">Cardiology <span>LIVE</span></div><div class="board-card-middle"><small>NOW SERVING · 1 DOCTOR</small><div class="board-active-codes"><span class="board-code-chip"><b>CAR-012</b><small>Counter 3</small></span></div></div><div class="board-card-bottom"><span>People waiting</span><b>6</b></div></article><article class="board-card"><div class="board-card-top">Laboratory <span>LIVE</span></div><div class="board-card-middle"><small>NOW SERVING · 0 DOCTORS</small><div class="board-active-codes">—</div></div><div class="board-card-bottom"><span>People waiting</span><b>3</b></div></article>''')
    fixtures['preview-public-board']=save_fixture(s,'preview-public-board',tmp)
    s=fixture('admin.html');clean_modals(s);hide(s,'admin-guard');reveal(s,'admin-content');put(s,'admin-hospital-name','Example Clinic · Hospital administration')
    for id,val in [('admin-waiting','17'),('admin-serving','2'),('admin-completed','28'),('admin-average','7'),('staff-count','9'),('department-count','3'),('invite-count','1')]:put(s,id,val)
    markup(s,'#doctor-list','''<div class="doctor-card"><div><strong>Dr. Avery Hassan</strong><small>Physiotherapy · Room P-204 · Active</small></div><button class="btn btn-small btn-outline">Update</button></div><div class="doctor-card"><div><strong>Dr. Nadia Ali</strong><small>Physiotherapy · Room P-210 · Active</small></div><button class="btn btn-small btn-outline">Update</button></div>''')
    markup(s,'#doctor-department','<option>Physiotherapy</option><option>Cardiology</option>')
    fixtures['preview-doctors']=save_fixture(s,'preview-doctors',tmp)
    markup(s,'#history-days','''<details class="history-day" open><summary><b>15 November 2026 · Physiotherapy</b><span>2 records · Fictional data</span></summary><div class="history-tools"><label>Department<select><option>Physiotherapy</option></select></label><label>Ticket number<input value="PHY-009"></label><button class="btn btn-small btn-primary">Search</button></div><div class="history-results"><div class="history-record"><div><strong>Ms Demo Patient · PHY-009</strong><small>Dr. Nadia Ali · Room P-210 · Issued 11:17 AM</small></div><div class="history-record-actions"><span class="activity-state">Waiting</span><button class="btn btn-small btn-outline">Details</button></div></div><div class="history-record"><div><strong>Mr Example Person · PHY-007</strong><small>Dr. Avery Hassan · Room P-204 · Issued 11:10 AM</small></div><div class="history-record-actions"><span class="activity-state">Completed</span><button class="btn btn-small btn-outline">Details</button></div></div></div></details>''')
    fixtures['preview-records']=save_fixture(s,'preview-records',tmp)
    # A full, readable Details dialog with issuing and calling counters kept distinct.
    s=fixture('admin.html');hide(s,'admin-guard');reveal(s,'admin-content');reveal(s,'history-detail-modal')
    put(s,'history-detail-title','Details of Ms Demo Patient')
    rows=[('Ticket','PHY-009'),('Patient','Ms Demo Patient'),('Department','Physiotherapy'),('Doctor','Dr. Nadia Ali'),('Room','P-210'),('Issued','11:17 AM'),('Issued by receptionist','Ms Samira'),('Issuing counter','Counter 2'),('Called','11:25 AM'),('Called from counter','Counter 3'),('Called by staff','Mr Bilal'),('Status','Completed')]
    markup(s,'#history-detail-body',''.join(f'<div class="history-detail-row"><span>{a}</span><strong>{b}</strong></div>' for a,b in rows))
    fixtures['preview-record-detail']=save_fixture(s,'preview-record-detail',tmp)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-gpu'])
        context=browser.new_context(viewport={'width':1440,'height':920},device_scale_factor=1,java_script_enabled=False,color_scheme='dark')
        page=context.new_page()
        # Screenshots are taken from whole DOM elements, never from arbitrary mid-card crops.
        targets={
            'preview-home':'.site-header',
            'preview-patient':'.track-main',
            'preview-reception':'#dashboard',
            'preview-public-board':'.board-main',
            'preview-doctors':'#doctors-section',
            'preview-records':'.admin-history-panel',
            'preview-record-detail':'#history-detail-modal .modal-sheet'
        }
        for key,source in fixtures.items():
            page.set_content(source.read_text(encoding='utf-8'),wait_until='load')
            locator=page.locator(targets[key]);locator.wait_for(state='visible')
            # Capture marketing's complete navbar + hero as a cohesive full-width section.
            if key=='preview-home':
                box=page.locator('.hero').bounding_box()
                if not box:raise RuntimeError('Missing home hero')
                png=page.screenshot(clip={'x':0,'y':0,'width':1440,'height':round(box['y']+box['height'])},animations='disabled')
            else:png=locator.screenshot(animations='disabled')
            from io import BytesIO
            im=Image.open(BytesIO(png)).convert('RGB')
            # Keep native aspect ratio and all content; only downsize very wide screenshots.
            if im.width>1400:
                im=im.resize((1400,round(im.height*1400/im.width)),Image.Resampling.LANCZOS)
            path=OUT/(key+'.webp');im.save(path,'WEBP',quality=87,method=6)
            print(f'{path.relative_to(ROOT)}: {im.width}×{im.height}, {path.stat().st_size:,} bytes')
        context.close();browser.close()

