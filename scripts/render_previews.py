"""Render actual TurnAhead page markup with fictitious queue data.
Uses WeasyPrint print renderer instead of a browser. Output is a visual preview,
not proof that Firebase or actual UI is connected. Does not access patient data.
"""
from pathlib import Path
from bs4 import BeautifulSoup
from weasyprint import HTML,CSS
import fitz
from PIL import Image
from io import BytesIO

ROOT=Path(__file__).resolve().parents[1]
PUB=ROOT/'public'; DEST=ROOT/'docs/assets';DEST.mkdir(exist_ok=True,parents=True)
PRINT='''@page{size:1350px 850px;margin:0}
body>*:not(.modal-backdrop){display:block!important}
.site-header{display:block!important;position:relative!important}
.modal-backdrop[hidden],[hidden]{display:none!important}
#dashboard[hidden],#admin-content[hidden],#track-content[hidden]{display:none!important}
#login-view[hidden],#admin-guard[hidden],#track-loading[hidden]{display:none!important}
.nav{display:flex!important}.stats-grid{display:grid!important}.desk-grid{display:grid!important}
.brand{display:flex!important}.board-grid{display:grid!important}
.hero{display:grid!important}
.hero-copy h1{font-size:68px!important;line-height:1.06!important;letter-spacing:-2px!important;font-weight:800!important}
.hero-copy h1 em{display:block!important;line-height:1.07!important}
.track-code{font-size:74px!important;font-weight:900!important;line-height:1.1!important;letter-spacing:-2px!important;display:block!important}
.board-grid{display:flex!important;gap:17px!important;align-items:stretch!important}
.board-grid>.board-card{flex:1 1 31%!important;min-width:0!important}
.board-code-chip{padding:11px!important;min-width:90px!important}
.board-code-chip b{font-size:32px!important;line-height:1.2!important;letter-spacing:-1px!important}
.board-code-chip small{font-size:11px!important}
.history-tools label{min-width:0!important;max-width:42%!important}
.history-tools input,.history-tools select{max-width:100%!important}
body{overflow:hidden!important}
'''
def filehtml(name):return BeautifulSoup((PUB/name).read_text(),'html.parser')
def settext(s,id,text):s.select_one('#'+id).string=str(text)
def sethtml(s,id,html):s.select_one('#'+id).clear();s.select_one('#'+id).append(BeautifulSoup(html,'html.parser'))
def show(s,id):s.select_one('#'+id).attrs.pop('hidden',None)
def hide(s,id):s.select_one('#'+id)['hidden']=''
def remove_modals(s):
    for modal in s.select('.modal-backdrop'):modal.decompose()
def save(name,soup,crop=None,page_height=850):
    # Image from actual HTML/CSS used by the project; the fixture values are fictional.
    pdf=HTML(string=str(soup),base_url=(PUB.as_uri()+'/')).write_pdf(stylesheets=[CSS(string=PRINT.replace('850px',str(page_height)+'px'))])
    doc=fitz.open(stream=pdf,filetype='pdf')
    pix=doc[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
    img=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
    if crop:img=img.crop(crop)
    if img.width>1320:img.resize((1320,round(img.height*1320/img.width)),Image.Resampling.LANCZOS)
    img=img.resize((1100,round(img.height*1100/img.width)),Image.Resampling.LANCZOS)
    img.save(DEST/name,'WEBP',quality=76,method=6)
    print(name,len(pdf),img.size,(DEST/name).stat().st_size)

# Marketing: first screen, real site but print engine cannot reproduce exact animation/sticky behavior.
s=filehtml('index.html');remove_modals(s);save('preview-home.webp',s)

# Staff: show same dashboard markup as the deployed app, with demonstration records.
s=filehtml('desk.html');remove_modals(s);hide(s,'login-view');hide(s,'verify-view');hide(s,'no-access-view');show(s,'dashboard');show(s,'staff-greeting')
settext(s,'staff-greeting','Ms Samira');settext(s,'facility-heading','Example Clinic · Sunday, November 15')
for id,value in [('stat-waiting','17'),('stat-active','2'),('stat-completed','28'),('activity-count','2 recent')]:settext(s,id,value)
sethtml(s,'queue-tabs','<button class="queue-tab active">Physiotherapy</button><button class="queue-tab">Cardiology</button><button class="queue-tab">Laboratory</button>')
sethtml(s,'queue-detail','''<div class="queue-view"><div class="queue-topline"><div><strong>Physiotherapy</strong><small>PHY · 8 waiting across 2 doctors</small></div><span class="state-pill">● LIVE</span></div><button class="btn btn-small btn-outline" style="margin-top:12px">⏸ Pause department</button><div class="doctor-tabs"><button class="doctor-tab selected"><span>Avery Hassan</span><small>5 waiting · Available</small></button><button class="doctor-tab"><span>Nadia Ali</span><small>3 waiting · Available</small></button></div><div class="doctor-queue-heading"><div><span class="kicker">DOCTOR-SPECIFIC QUEUE</span><h3>Dr. Avery Hassan</h3><small>Room P-204</small></div><span class="state-pill">● ACCEPTING</span></div><div class="serving-box"><div><span>NOW SERVING</span><strong>PHY-007</strong><small>Called from Counter 2</small></div><span class="serving-symbol">↗</span></div><div class="queue-facts"><span><b>5</b> waiting for this doctor</span><span><b>14</b> completed</span><span><b>7 min</b> average</span></div><div class="queue-buttons"><button class="btn btn-primary">Call next ↗</button><button class="btn btn-positive">✓ Complete</button><button class="btn btn-danger">Skip</button><button class="btn btn-outline">⏸ Doctor break</button></div><p class="queue-caption">Independent doctor lines; synchronized actions across counters.</p></div>''')
sethtml(s,'recent-tickets','''<div class="activity-item"><div class="activity-token">PHY-009</div><div class="activity-main"><b>Ms Demo Patient · Physiotherapy</b><small>Dr. Nadia Ali · 11:17 AM</small></div><span class="activity-state">waiting</span></div><div class="activity-item"><div class="activity-token">PHY-008</div><div class="activity-main"><b>Mr Example Person · Physiotherapy</b><small>Dr. Avery Hassan · 11:14 AM</small></div><span class="activity-state">waiting</span></div>''')
if s.select_one('#counter-select'):
 for opt in s.select('#counter-select option'):
  if opt.get('value')=='2':opt['selected']='selected'
  else:opt.attrs.pop('selected',None)
save('preview-reception.webp',s,page_height=1260)

# Patient QR — sample queue ticket and ETA.
s=filehtml('track.html');remove_modals(s);hide(s,'track-loading');show(s,'track-content')
for id,value in [('sync-state','LIVE · SYNCED'),('track-code','PHY-009'),('track-queue','Example Clinic · Physiotherapy'),('track-patient','Ticket for Ms Demo Patient'),('track-visit','Visiting Dr. Nadia Ali · Room P-210'),('track-state','WAITING'),('ahead-label','PEOPLE AHEAD OF YOU'),('ahead-count','3'),('track-eta','12–18 min'),('track-eta-clock','Around 11:35 AM (PKT) · estimate only'),('track-serving','PHY-007'),('track-message','Your place updates as reception calls each patient.'),('progress-description','3 people ahead of you. Times can change; stay near reception.')]:settext(s,id,value)
save('preview-patient.webp',s)

# Public board — several counters can serve simultaneously, no patient names.
s=filehtml('board.html');remove_modals(s);settext(s,'board-time','11:17:45 AM');settext(s,'board-facility','Example Clinic · Live queue overview')
sethtml(s,'board-grid','''<article class="board-card"><div class="board-card-top">Physiotherapy <span>LIVE</span></div><div class="board-card-middle"><small>NOW SERVING · 2 DOCTORS</small><div class="board-active-codes"><span class="board-code-chip"><b>PHY-007</b><small>Counter 2</small></span><span class="board-code-chip"><b>PHY-005</b><small>Counter 1</small></span></div></div><div class="board-card-bottom"><span>People waiting</span><b>8</b></div></article><article class="board-card"><div class="board-card-top">Cardiology <span>LIVE</span></div><div class="board-card-middle"><small>NOW SERVING · 1 DOCTOR</small><div class="board-active-codes"><span class="board-code-chip"><b>CAR-012</b><small>Counter 3</small></span></div></div><div class="board-card-bottom"><span>People waiting</span><b>6</b></div></article><article class="board-card"><div class="board-card-top">Laboratory <span>LIVE</span></div><div class="board-card-middle"><small>NOW SERVING · 0 DOCTORS</small><div class="board-active-codes">—</div></div><div class="board-card-bottom"><span>People waiting</span><b>3</b></div></article>''')
save('preview-public-board.webp',s)

# Owner-only doctor directory and private dated history (fictional names).
s=filehtml('admin.html');remove_modals(s);hide(s,'admin-guard');show(s,'admin-content');settext(s,'admin-hospital-name','Example Clinic · Hospital administration')
for id,value in [('admin-waiting','17'),('admin-serving','2'),('admin-completed','28'),('admin-average','7'),('staff-count','9'),('department-count','3'),('invite-count','1')]:settext(s,id,value)
sethtml(s,'doctor-list','''<div class="doctor-card"><div><strong>Dr. Avery Hassan</strong><small>Physiotherapy · Room P-204 · Active</small></div><button class="btn btn-small btn-outline">Update</button></div><div class="doctor-card"><div><strong>Dr. Nadia Ali</strong><small>Physiotherapy · Room P-210 · Active</small></div><button class="btn btn-small btn-outline">Update</button></div>''')
sethtml(s,'doctor-department','<option>Physiotherapy</option><option>Cardiology</option>')
# WeasyPrint only renders page one; move selected component to a stand-alone demo page using its genuine markup and existing CSS.
def section_sample(selector,name):
 section=s.select_one(selector)
 shell=BeautifulSoup('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./styles.css"></head><body class="workspace"><main class="shell desk-main admin-main"></main></body></html>','html.parser')
 shell.main.append(section)
 save(name,shell,crop=(0,0,2025,900))
section_sample('#doctors-section','preview-doctors.webp')
sethtml(s,'history-days','''<details class="history-day" open><summary><b>15 November 2026 · Physiotherapy</b><span>2 records · Sample data</span></summary><div class="history-tools"><label>Department<select><option>Physiotherapy</option></select></label><label>Ticket number<input value="PHY-009"></label><button class="btn btn-small btn-primary">Search</button></div><div class="history-results"><div class="history-record"><div><strong>Ms Demo Patient · PHY-009</strong><small>Dr. Nadia Ali · Room P-210 · Issued 11:17 AM</small></div><div class="history-record-actions"><span class="activity-state">Waiting</span><button class="btn btn-small btn-outline">Details</button></div></div><div class="history-record"><div><strong>Mr Example Person · PHY-007</strong><small>Dr. Avery Hassan · Room P-204 · Issued 11:10 AM</small></div><div class="history-record-actions"><span class="activity-state">Completed</span><button class="btn btn-small btn-outline">Details</button></div></div></div></details>''')
section_sample('.admin-history-panel','preview-records.webp')
