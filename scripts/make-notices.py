"""Regenerate the three fictional PNG test fixtures with Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = Path('/System/Library/Fonts/Supplemental')

def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / f'{name}.ttf'), size)

def make_notice(title, date, time, room, footer, faded=False):
    paper = Image.new('RGB', (760, 500), '#fffcf5' if not faded else '#efebe2')
    draw = ImageDraw.Draw(paper)
    ink = '#252623' if not faded else '#c9c3b7'
    accent = '#a73a23' if not faded else '#c9c3b7'
    draw.text((58, 47), 'NORTHFIELD COLLEGE', font=font('Arial Bold', 21), fill=accent)
    draw.line((58, 91, 702, 91), fill=accent, width=2)
    draw.text((56, 118), title, font=font('Georgia Bold', 43), fill=ink)
    for y, label, value in [(220, 'Date', date), (274, 'Time', time), (328, 'Room', room)]:
        draw.text((58, y), f'{label}: {value}', font=font('Arial', 30), fill=ink)
    draw.line((58, 401, 702, 401), fill=accent, width=2)
    draw.text((58, 425), footer, font=font('Arial', 21), fill=ink)
    return paper

folder = ROOT / 'public' / 'notices'
make_notice('Library orientation', 'October 14, 2026', '2:30 PM', 'B204', 'All students are welcome.').save(folder / 'clear.png')
blurred = make_notice('Peer tutoring meetup', 'October 21, 2026', '4:00 PM', 'C118', 'Bring a notebook and a pen.')
blurred.filter(ImageFilter.GaussianBlur(5.3)).save(folder / 'blurry.png')
make_notice('Lab safety briefing', 'November 3, 2026', '10:15 AM', 'D307', 'Open to first-year lab students.', faded=True).save(folder / 'low-contrast.png')
