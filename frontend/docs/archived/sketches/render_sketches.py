"""Render static discussion sketches. This is a documentation utility, not app UI."""
from pathlib import Path
from html import escape
from math import atan2, cos, sin
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
W = 1600
INK = '#242424'
GRAY = '#656565'
BG = '#fafafa'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
FONTS = {}

def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype(str(FONT_DIR / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)
    return FONTS[key]

class Canvas:
    def __init__(self, height, title, subtitle):
        self.h = height
        self.image = Image.new('RGB', (W, height), BG)
        self.draw = ImageDraw.Draw(self.image)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{height}" viewBox="0 0 {W} {height}">', f'<title>{escape(title)}</title>', f'<rect width="{W}" height="{height}" fill="{BG}"/>']
        self.text(48, 35, title, 31, True)
        self.wrap(48, 82, subtitle, W-96, 18, color=GRAY)

    def rect(self, x, y, w, h, fill='white', stroke='#aaa', radius=8, width=1):
        self.draw.rounded_rectangle((x,y,x+w,y+h), radius=radius, fill=None if fill=='none' else fill, outline=stroke, width=width)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{width}"/>')

    def text(self, x, y, value, size=18, bold=False, color=INK):
        self.draw.text((x,y), value, font=font(size,bold), fill=color, anchor='lt')
        self.svg.append(f'<text x="{x}" y="{y+size*.83}" font-family="Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(value)}</text>')

    def lines(self, value, width, size=18, bold=False):
        lines=[]
        for para in value.split('\n'):
            line=''
            for word in para.split():
                next_line = f'{line} {word}'.strip()
                if self.draw.textlength(next_line,font=font(size,bold)) > width and line:
                    lines.append(line); line=word
                else: line=next_line
            lines.append(line)
        return lines

    def wrap(self, x, y, value, width, size=18, bold=False, color=INK):
        lines=self.lines(value,width,size,bold)
        for line in lines:
            self.text(x,y,line,size,bold,color); y += size*1.35
        return y

    def line(self, points, color='#aaa', width=1, dashed=False, arrow=False):
        if dashed:
            for (x1,y1),(x2,y2) in zip(points,points[1:]):
                length=((x2-x1)**2+(y2-y1)**2)**.5
                for p in range(0, int(length), 14):
                    q=min(p+7,length)
                    self.draw.line([(x1+(x2-x1)*p/length,y1+(y2-y1)*p/length),(x1+(x2-x1)*q/length,y1+(y2-y1)*q/length)],fill=color,width=width)
        else:self.draw.line(points,fill=color,width=width)
        pts=' '.join(f'{x},{y}' for x,y in points)
        self.svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}"'+(' stroke-dasharray="7 7"' if dashed else '')+'/>')
        if arrow:
            x,y=points[-1]; x0,y0=points[-2]; angle=atan2(y-y0,x-x0)
            tips=[(x-11*cos(angle-.45),y-11*sin(angle-.45)),(x,y),(x-11*cos(angle+.45),y-11*sin(angle+.45))]
            self.line(tips,color,width)

    def save(self, name):
        self.image.save(OUT / f'{name}.png')
        (OUT / f'{name}.svg').write_text('\n'.join(self.svg+['</svg>']))

def options(*labels, selected=None): return ('options', labels, selected)
def para(s): return ('p',s)
def question(s): return ('q',s)
def hint(s): return ('hint',s)
def field(label,value): return ('field',label,value)
def button(*labels): return ('button',labels)
def box(label,body): return ('box',label,body)
def divider(label): return ('divider',label)

def card(c,x,y,code,title,items,signal,h=440):
    width=728
    c.rect(x,y,width,h)
    c.text(x+22,y+19,code,12,True,GRAY)
    yy=c.wrap(x+22,y+48,title,width-44,25,True)+16
    for item in items:
        kind=item[0]
        if kind in ('p','q','hint'):
            size=18 if kind!='hint' else 15
            yy=c.wrap(x+22,yy,item[1],width-44,size,kind=='q',GRAY if kind=='hint' else INK)+11
        elif kind=='field':
            c.text(x+22,yy,item[1],13,True,GRAY);yy+=22
            value=item[2]
            field_h=48 if c.draw.textlength(value,font=font(18))<width-74 else 70
            c.rect(x+22,yy,width-44,field_h,'#f5f5f5','#ccc',4)
            c.wrap(x+34,yy+12,value,width-68,18)
            yy+=field_h+14
        elif kind in ('options','button'):
            labels=item[1]; selected=item[2] if kind=='options' else None
            xx=x+22; row_y=yy
            for i,label in enumerate(labels):
                size=16
                text=f'[x] {label}' if i==selected else label
                ww=c.draw.textlength(text,font=font(size,i==selected))+28
                if xx+ww>x+width-22:xx=x+22;row_y+=47
                active=i==selected or (kind=='button' and i==0)
                c.rect(xx,row_y,ww,35,'#e7e7e7' if active else 'white','#777' if active else '#bbb',4)
                c.text(xx+14,row_y+9,text,size,i==selected)
                xx+=ww+9
            yy=row_y+48
        elif kind=='box':
            lines=len(c.lines(item[2],width-68,17))
            bh=49+lines*24
            c.rect(x+22,yy,width-44,bh,'#f5f5f5','#d4d4d4',4)
            c.text(x+34,yy+12,item[1],12,True,GRAY)
            c.wrap(x+34,yy+35,item[2],width-68,17)
            yy+=bh+13
        elif kind=='divider':
            c.line([(x+22,yy),(x+width-22,yy)],'#ddd')
            c.text(x+22,yy+12,item[1],12,True,GRAY);yy+=36
    if yy > y+h-73:
        raise RuntimeError(f'{code} content overflows by {yy-(y+h-73):.1f}px')
    c.rect(x+1,y+h-70,width-2,69,'#f0f0f0',None,0)
    c.text(x+22,y+h-58,'GRAPH NOTE · OUTSIDE THE SCREEN',10,True,GRAY)
    end=c.wrap(x+22,y+h-40,signal,width-44,14,color=GRAY)
    if end>y+h-2:raise RuntimeError(f'{code} signal overflow')

def board(name,title,subtitle,left_label,right_label,rows):
    h=188+len(rows)*478+42
    c=Canvas(h,title,subtitle)
    c.text(48,139,left_label,19,True)
    c.text(824,139,right_label,19,True)
    for i,(left,right) in enumerate(rows):
        y=182+i*478
        card(c,48,y,*left)
        card(c,824,y,*right)
        if i<len(rows)-1:
            for xx in (412,1188):c.line([(xx,y+445),(xx,y+471)],'#999',1,arrow=True)
    c.text(48,h-26,'DISCUSSION SKETCH · fictional example · successive states may be grouped · no working UI',13,color=GRAY)
    c.save(name)

board('01-context-and-connections','01 / Attendee + exhibitor: context and connections',
      'Read each column downward. These journeys happen in parallel; matching rows are not necessarily simultaneous.',
      'ATTENDEE · Alex, founder of a skincare brand','EXHIBITOR · RefillWorks, refillable packaging',[
    (
      ('A1 · CONFIRM CONTEXT','What would make this event worthwhile?',[
        box('PROFILE TO CONFIRM','Alex Morgan · founder · Oak & Fern. Your company makes skincare products.'),
        button('Looks right','Edit'),field('YOUR EVENT GOAL','Find suppliers'),button('Continue')],
       'Confirmed professional context + stated goal. Imported profile details remain editable.'),
      ('E1 · CONFIRM CONTEXT','Who are you here to help?',[
        box('COMPANY TO CONFIRM','RefillWorks provides refillable packaging for skincare and beauty brands.'),
        button('Looks right','Edit'),field('YOUR EVENT GOAL','Meet growing skincare brands'),button('Continue')],
       'Confirmed capabilities + exhibitor goal. A website description does not establish every constraint.')
    ),
    (
      ('A2 · DYNAMIC QUESTION','Which suppliers are you looking for?',[
        para('For your skincare business, are you looking for…'),
        options('Ingredients','Packaging','Manufacturing',selected=1),
        options('Something else','Not sure yet'),
        question('Receive relevant booth invitations?'),
        options('Yes, share my event goals','No booth invitations',selected=0),button('Continue')],
       'Alex selects packaging and opts into invitations using shared event goals. No purchase is inferred.'),
      ('E2 · DYNAMIC QUESTIONS · SUCCESSIVE STATES','Which customers can you serve?',[
        options('Brand owners','Manufacturers','Distributors',selected=0),
        question('What is the smallest order you can support?'),field('MINIMUM ORDER','500 units'),
        button('Continue')],
       'Audience + a concrete capability constraint. Ask the second question only if not already confirmed.')
    ),
    (
      ('A3 · CHANCE ENCOUNTER → CONFIRMATION','You saved Maya as a connection.',[
        para('You scanned Maya’s badge after a conversation you liked.'),
        hint('Connection saved. No feedback prompt.'),
        divider('LATER · YOUR ORGANIZER-ARRANGED MEETUP'),
        para('Theo · sustainable-packaging advisor\n2:00–2:15 PM · Table 4'),
        hint('A conversation about packaging options for an emerging brand.'),button('View meetup')],
       'Alex → Maya: chosen affinity. Alex–Theo: scheduled exposure. Neither establishes buying intent.'),
      ('E3 · DEFINE A SPECIFIC OPPORTUNITY','Give people a reason to visit.',[
        field('WHAT CAN SOMEONE ACCOMPLISH?','Compare refillable samples with our packaging specialist.'),
        para('15 minutes · Booth 24\n3:00–4:00 PM · four available appointments'),
        hint('For skincare brands exploring runs of 500 units or more.'),button('Review offer')],
       'The offer connects a capability, useful activity, location, availability, and capacity.')
    ),
])

board('02-from-signal-to-invitation','02 / From connection signals to a relevant invitation',
      'The app uses evidence from the shared graph, checks one missing constraint, then lets both parties choose.',
      'ATTENDEE · Alex','EXHIBITOR · RefillWorks',[
    (
      ('A4 · ARRANGED MEETUP FEEDBACK','Was your conversation with Theo useful?',[
        options('Yes','Somewhat','No','We didn’t meet',selected=0),
        divider('OPTIONAL FOLLOW-UP · SHOWN AFTER “YES”'),
        question('What should your next introduction help with?'),
        options('Refillable formats','Material choices','Production costs',selected=0),
        button('Save','Skip')],
       'Alex reports a useful meeting and explicitly refines the need to refillable formats. No transcript.'),
      ('E4 · POTENTIAL FIT','Alex may be a fit for your offer.',[
        para('Skincare founder\nLooking for packaging suppliers\nExploring refillable formats'),
        box('ONE IMPORTANT DETAIL IS MISSING','Order size has not been confirmed.'),
        hint('Status: clarification pending. No invitation has been sent.')],
       'Maya’s useful booth visit helps surface the candidate. Only appropriate profile/goal details are shown.')
    ),
    (
      ('A5 · DYNAMIC FIT CHECK','One detail before we suggest a visit.',[
        para('A relevant refillable-packaging supplier starts at 500 units.'),
        question('Would that work for the project you’re exploring?'),
        options('Yes','No','Not sure yet',selected=0),
        button('Continue')],
       'A decisive constraint is now confirmed. “No” filters this offer; “not sure” stays unresolved.'),
      ('E5 · REVIEW → INVITE','Invite Alex to compare samples.',[
        para('Why this fits: skincare brand + refillable interest + compatible order size.'),
        box('INVITATION PREVIEW','Compare refillable samples with our specialist. 15 minutes at Booth 24; formats start at 500 units.'),
        button('Send invitation','Edit')],
       'Exhibitor authorizes a specific invitation. Private connection histories and meetup ratings stay internal.')
    ),
    (
      ('A6 · RECEIVED INVITATION','RefillWorks invites you to Booth 24.',[
        para('Compare refillable samples and discuss fit with a packaging specialist.'),
        hint('Why this fits: you’re exploring refillable skincare packaging, and a 500-unit minimum works for you.'),
        question('Choose a 15-minute visit'),
        options('3:00 PM','3:15 PM','3:30 PM','3:45 PM',selected=0),
        button('Accept 3:00 PM','Not now','Not relevant')],
       'Accepted invitation + reserved slot. “Not now” is a timing response; acceptance is not attendance.'),
      ('E6 · ACCEPTED INVITATION','Alex chose 3:00 PM.',[
        box('PLANNED VISIT','Alex Morgan · Oak & Fern\n15-minute sample consultation · Booth 24'),
        para('One appointment reserved.\nAwaiting check-in.'),
        button('View appointment')],
       'The offer now has an accepted booking. The graph has no completed-visit evidence yet.')
    ),
    (
      ('A7 · AFTER THE BOOTH VISIT','Did you find what you needed?',[
        hint('Visit checked in · Booth 24'),
        question('Was the visit useful?'),options('Yes','Somewhat','No',selected=0),
        question('Would you like to share a next step with RefillWorks?'),
        options('Ask for a sample quote','Nothing yet',selected=0),button('Save')],
       'Visit + private usefulness + an explicitly shared next-step request. No sale is inferred.'),
      ('E7 · OUTCOME','A useful next step to follow up.',[
        para('1 invitation sent → 1 accepted → 1 visit checked in'),
        box('ALEX SHARED A NEXT STEP','Would like a sample quote.'),
        hint('The request is visible to your team. A quote has not been sent.'),button('View request')],
       'Track accepted visits and shared follow-ups. A person’s private feedback is not an exhibitor rating feed.')
    ),
])

board('03-attendee-to-attendee','03 / A peer introduction from the same attendee graph',
      'Nia is a fictional additional attendee. This branch can happen alongside the booth invitation; neither depends on accepting the other.',
      'ATTENDEE · Alex, exploring refillable packaging','ATTENDEE · Nia, willing to share launch experience',[
    (
      ('P1 · SUGGESTED PEER','Nia has been through a refillable launch.',[
        para('Nia Patel · founder of LoopLeaf\nOpen to sharing lessons from a refillable-skincare launch.'),
        question('What would make this conversation useful?'),
        options('Launch pitfalls','Supplier selection','Compare approaches',selected=0),
        button('Ask Nia for 15 minutes','Not now')],
       'Alex → Maya → Nia surfaces a candidate. Relevant experience + Nia’s willingness support the suggestion.'),
      ('N1 · SET BEFORE THE SUGGESTION','What are you open to at this event?',[
        para('Your profile mentions a refillable-product launch. Confirm or edit that context.'),
        question('Would you like to…'),options('Share launch lessons','Compare approaches','Meet partners',selected=0),
        hint('Availability: a 15-minute conversation at 4:00 PM.'),button('Save preferences','Not meeting right now')],
       'Nia confirms experience, willingness, and availability. Expertise alone is not permission to book her.')
    ),
    (
      ('P2 · REVIEW INTRODUCTION REQUEST','Give Nia a reason to say yes.',[
        box('YOUR REQUEST','I’m exploring refillable packaging for my skincare brand and would value lessons from your first launch.'),
        para('4:00–4:15 PM · Coffee area'),button('Send request','Edit'),
        hint('After sending: awaiting Nia’s reply.')],
       'An explicit request is created. No confirmed meeting or chosen friendship exists yet.'),
      ('N2 · RECEIVED REQUEST','Alex would like to learn from your launch.',[
        para('Alex Morgan · founder, Oak & Fern\nExploring refillable packaging; interested in launch pitfalls.'),
        box('PROPOSED MEETING','4:00–4:15 PM · Coffee area'),
        button('Accept','Suggest another time','Pass')],
       'Nia’s acceptance confirms the meeting. The app does not claim Maya personally endorsed either attendee.')
    ),
    (
      ('P3 · CONFIRMED → AFTER MEETING','Your conversation with Nia',[
        para('4:00–4:15 PM · Coffee area'),
        divider('AFTER THE MEETING'),question('Did this help with your launch questions?'),
        options('Yes','Somewhat','No','We didn’t meet',selected=0),
        button('Save Nia as a connection','Done')],
       'Alex’s usefulness response and optional chosen connection are separate signals. No exhibitor lead is created.'),
      ('N3 · AFTER MEETING','Was this a conversation you wanted to have?',[
        options('Yes','Somewhat','No','We didn’t meet',selected=0),
        hint('Optional. Your answer is private.'),
        question('Would you like to stay connected with Alex?'),
        button('Save Alex as a connection','Done')],
       'Nia can give a different response. A reciprocal connection exists only if both explicitly choose it.')
    ),
])

c=Canvas(1480,'04 / One sample graph, two useful outcomes',
         'Illustrative evidence for discussion. Existing relationships, chosen connections, scheduled exposure, and feedback keep their own meanings.')

def node(x,y,title,body,tag):
    c.rect(x,y,330,112,'white','#888')
    c.text(x+16,y+13,tag,11,True,GRAY)
    c.text(x+16,y+36,title,23,True)
    c.wrap(x+16,y+70,body,298,16,color=GRAY)

# Sample evidence. Arrows retain direction; a line alone does not mean mutual approval.
node(230,190,'Maya','Peer Alex chose to stay connected with','PERSON')
node(980,190,'Nia','Refillable-launch experience; open to help','PERSON · ADDED FOR THE PEER BRANCH')
node(230,480,'Alex','Skincare founder; looking for suppliers','PERSON')
node(980,480,'Theo','Sustainable-packaging advisor','PERSON')
node(230,790,'Alex’s current need','Refillable packaging; 500 units works','EXPLICIT ANSWERS')
node(980,790,'RefillWorks','Refillable packaging; minimum 500 units','EXHIBITOR CAPABILITY')

c.line([(395,480),(395,302)],INK,2,arrow=True)
c.text(48,368,'CHOSEN QR CONNECTION',12,True)
c.wrap(48,392,'Alex saved Maya after an organic encounter.',310,15,color=GRAY)
c.line([(560,240),(980,240)],'#777',2)
c.text(611,207,'EXISTING PROFESSIONAL TIE*',12,True)
c.text(621,263,'Maya ↔ Nia',16,color=GRAY)

for yy,label,dashed in [(493,'ARRANGED PAIRING',True),(534,'ATTENDED',False),(575,'USEFUL, ACCORDING TO ALEX',False)]:
    c.line([(560,yy),(980,yy)],'#777',1,dashed,arrow=True)
    c.rect(636,yy-13,283,25,BG,None,0)
    c.text(644,yy-8,label,12,True,GRAY)

c.line([(500,302),(500,350),(1450,350),(1450,846),(1310,846)],'#777',2,arrow=True)
c.text(790,326,'MAYA VISITED THIS BOOTH AND REPORTED IT USEFUL',12,True,GRAY)
c.wrap(1110,634,'Booth feedback is an internal signal, not public endorsement.',285,14,color=GRAY)

c.line([(395,592),(395,790)],INK,2,arrow=True)
c.text(435,672,'GOAL → TARGETED QUESTIONS',12,True)
c.wrap(435,698,'Packaging → refillable formats → compatible order size',430,15,color=GRAY)
c.line([(560,846),(980,846)],'#777',2,True,arrow=True)
c.rect(650,824,244,41,BG,None,0)
c.text(662,836,'POTENTIAL PRACTICAL FIT',12,True,GRAY)

c.text(48,965,'TWO OUTPUTS · DASHED = PLANNED OR PROPOSED; SOLID = RECORDED EVIDENCE',14,True,GRAY)
for x in (48,824):
    c.rect(x,1008,728,296,'#f4f4f4','#aaa',8)
c.text(70,1031,'PEER INTRODUCTION · NIA',16,True)
c.wrap(70,1070,'Alex → chosen connection with Maya → existing tie to Nia',675,20,True)
c.wrap(70,1133,'Add Nia’s relevant launch experience and willingness to help. Ask Alex which topic would make the conversation useful.',675,18)
c.wrap(70,1219,'Next: Alex requests → Nia accepts → they meet → each can respond and choose to stay connected.',675,16,color=GRAY)
c.text(846,1031,'BOOTH INVITATION · REFILLWORKS',16,True)
c.wrap(846,1070,'Alex → chosen connection with Maya → useful booth visit',675,20,True)
c.wrap(846,1133,'Combine with Alex’s stated need, compatible order size, and a specific sample consultation offered by RefillWorks.',675,18)
c.wrap(846,1219,'Next: exhibitor invites → Alex accepts → checks in → reports usefulness and optionally shares a follow-up.',675,16,color=GRAY)
c.wrap(48,1334,'* The Maya–Nia professional connection is an assumed sample edge, not a verified LinkedIn import. All people, companies, capacities, and outcomes on these boards are fictional.',1504,16,color=GRAY)
c.wrap(48,1393,'The social paths help discover candidates. Explicit needs, capabilities, willingness, and availability determine whether an invitation makes sense. Their predictive value still needs testing.',1504,16,color=GRAY)
c.save('04-expanded-sample-graph')
print('Rendered four static boards as PNG and SVG.')
