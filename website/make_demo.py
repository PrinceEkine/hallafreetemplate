"""Ophixe demo video: a 50-second animated tour rendered to MP4.

Usage:  python website/make_demo.py
Needs:  Pillow + ffmpeg on PATH.
Output: website/assets/demo.mp4 (+ demo-poster.png)

No app screenshots needed — every screen is a stylised mock drawn to match
the real app (black header, Oswald-style headings, teal accent).
"""
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 24
BG = (10, 10, 12)
PANEL = (23, 23, 28)
CARD = (35, 35, 42)
BORDER = (48, 48, 56)
WHITE = (245, 245, 247)
SUB = (167, 167, 176)
TEAL = (62, 230, 196)
INK = (8, 8, 10)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "demo.mp4")
POSTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "demo-poster.png")

# Phone geometry (right side of frame).
PX, PY, PW, PH = 812, 48, 320, 624


def load_font(bold: bool, size: int):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


F_TITLE = load_font(True, 64)
F_SUB = load_font(False, 30)
F_KICK = load_font(True, 22)
F_BODY = load_font(False, 26)
F_PHONE_H = load_font(True, 17)
F_PHONE = load_font(False, 15)
F_PHONE_B = load_font(True, 15)
F_PHONE_S = load_font(False, 12)
F_CODE = load_font(True, 30)


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def ease_out(t):
    t = clamp(t)
    return 1 - (1 - t) * (1 - t)


def fade_hint(t, at, span=0.4):
    """Alpha 0..255 for an element that appears at `at` over `span` seconds."""
    return int(255 * ease_out((t - at) / span)) if t >= at else 0


def rise_offset(t, at, span=0.45, dist=26):
    return int((1 - ease_out((t - at) / span)) * dist) if t >= at else dist


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text_block(draw, xy, text, font, max_w, fill, line_gap=8):
    x, y = xy
    for line in wrap(draw, text, font, max_w):
        draw.text((x, y), line, font=font, fill=fill)
        y += font.size + line_gap
    return y


def paste_alpha(base: Image.Image, layer: Image.Image):
    base.alpha_composite(layer)


def new_layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def draw_phone(draw: ImageDraw.ImageDraw, header_title: str):
    """Bezel + screen + app header. Returns (screen_x, content_top, screen_w)."""
    draw.rounded_rectangle([PX, PY, PX + PW, PY + PH], radius=44, fill=(0, 0, 0))
    draw.rounded_rectangle(
        [PX + 8, PY + 8, PX + PW - 8, PY + PH - 8], radius=36, fill=PANEL
    )
    sx, sw = PX + 8, PW - 16
    # Status bar.
    draw.text((sx + 22, PY + 18), "9:41", font=F_PHONE_S, fill=SUB)
    draw.rounded_rectangle(
        [sx + sw - 66, PY + 20, sx + sw - 22, PY + 32], radius=4, fill=CARD
    )
    # Notch.
    draw.rounded_rectangle(
        [PX + PW / 2 - 52, PY + 16, PX + PW / 2 + 52, PY + 36], radius=10, fill=(0, 0, 0)
    )
    # App header (black bar like the real app).
    hy = PY + 48
    draw.rectangle([sx, hy, sx + sw, hy + 52], fill=(0, 0, 0))
    tw = draw.textlength(header_title, font=F_PHONE_H)
    draw.text((sx + (sw - tw) / 2, hy + 16), header_title, font=F_PHONE_H, fill=WHITE)
    draw.ellipse([sx + sw - 40, hy + 12, sx + sw - 14, hy + 38], fill=TEAL)
    return sx, hy + 52, sw


def draw_tabs(draw: ImageDraw.ImageDraw, sx: int, sw: int, active: int):
    labels = ["Update", "Chat", "Home", "Teams", "Event"]
    ty = PY + PH - 8 - 56
    draw.rectangle([sx, ty, sx + sw, PY + PH - 8], fill=(16, 16, 20))
    draw.line([sx, ty, sx + sw, ty], fill=BORDER, width=1)
    cw = sw / 5
    for i, label in enumerate(labels):
        cx = sx + cw * i + cw / 2
        col = TEAL if i == active else SUB
        draw.ellipse([cx - 9, ty + 8, cx + 9, ty + 26], outline=col, width=2)
        tw = draw.textlength(label, font=F_PHONE_S)
        draw.text((cx - tw / 2, ty + 30), label, font=F_PHONE_S, fill=col)


def draw_field(draw, x, y, w, label, value, alpha=255, cursor=False):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.text((x, y), label, font=F_PHONE_S, fill=SUB + (alpha,))
    od.rounded_rectangle([x, y + 20, x + w, y + 62], radius=10, fill=CARD + (alpha,))
    od.text((x + 12, y + 32), value, font=F_PHONE, fill=WHITE + (alpha,))
    if cursor and value:
        vx = x + 12 + od.textlength(value, font=F_PHONE) + 3
        od.line([vx, y + 32, vx, y + 50], fill=TEAL + (alpha,), width=2)
    return overlay


def draw_button(draw, x, y, w, label, alpha=255, ghost=False):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    if ghost:
        od.rounded_rectangle(
            [x, y, x + w, y + 48], radius=12, outline=SUB + (alpha,), width=2
        )
        col = WHITE + (alpha,)
    else:
        od.rounded_rectangle([x, y, x + w, y + 48], radius=12, fill=WHITE + (alpha,))
        col = INK + (alpha,)
    tw = od.textlength(label, font=F_PHONE_B)
    od.text((x + (w - tw) / 2, y + 14), label, font=F_PHONE_B, fill=col)
    return overlay


def draw_bubble(od, x, y, w, lines, mine, font=F_PHONE):
    h = 16 + len(lines) * 22 + 14
    fill = (0, 0, 0) if mine else CARD
    od.rounded_rectangle([x, y, x + w, y + h], radius=14, fill=fill)
    if mine:
        od.rounded_rectangle([x, y, x + w, y + h], radius=14, outline=TEAL, width=1)
    yy = y + 12
    for line in lines:
        od.text((x + 12, y + 0), "", font=font)  # keep font warm
        od.text((x + 12, yy), line, font=font, fill=WHITE)
        yy += 22
    return h


def draw_post_card(od, x, y, w, name, time, text_lines, liked=False):
    od.rounded_rectangle([x, y, x + w, y + 118 + len(text_lines) * 4], radius=14, fill=CARD)
    od.ellipse([x + 12, y + 12, x + 44, y + 44], fill=TEAL)
    od.text((x + 52, y + 12), name, font=F_PHONE_B, fill=WHITE)
    od.text((x + 52, y + 32), time, font=F_PHONE_S, fill=SUB)
    yy = y + 56
    for line in text_lines:
        od.text((x + 12, yy), line, font=F_PHONE, fill=WHITE)
        yy += 20
    heart = TEAL if liked else SUB
    od.text((x + 12, yy + 6), "Like", font=F_PHONE_S, fill=heart)
    od.text((x + 70, yy + 6), "Comment", font=F_PHONE_S, fill=SUB)
    od.text((x + 150, yy + 6), "Share", font=F_PHONE_S, fill=SUB)
    return 128 + len(text_lines) * 4


LX = 80  # left caption column
LW = 620


def draw_caption(base, t, step, title, body, scene_idx, total_scenes):
    """Left-side caption with appear animation + progress dots."""
    layer = new_layer()
    od = ImageDraw.Draw(layer)
    a = fade_hint(t, 0.1)
    dy = rise_offset(t, 0.1)
    if a:
        od.text((LX, 200 + dy), step, font=F_KICK, fill=TEAL + (a,))
        y = 236 + dy
        for line in wrap(od, title, F_TITLE, LW):
            od.text((LX, y), line, font=F_TITLE, fill=WHITE + (a,))
            y += 76
        text_block(od, (LX, y + 8), body, F_BODY, LW, SUB + (a,))
    # Progress dots (all scenes incl. title/end).
    dot_y = H - 70
    for i in range(total_scenes):
        cx = LX + i * 34
        r = 7 if i == scene_idx else 5
        col = TEAL if i == scene_idx else BORDER
        od.ellipse([cx - r, dot_y - r, cx + r, dot_y + r], fill=col)
    paste_alpha(base, layer)


def draw_logo_mark(od, cx, cy, r):
    od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0))
    od.ellipse(
        [cx - r, cy - r, cx + r, cy + r], outline=(42, 42, 46), width=3
    )
    ir = int(r * 0.44)
    od.ellipse(
        [cx - ir, cy - ir, cx + ir, cy + ir], outline=WHITE, width=int(r * 0.2)
    )
    o = int(r * 0.32)
    od.line([cx - o, cy - o, cx + o, cy + o], fill=TEAL, width=int(r * 0.15))
    od.line([cx + o, cy - o, cx - o, cy + o], fill=TEAL, width=int(r * 0.15))
    od.ellipse(
        [cx + int(r * 0.5), cy - int(r * 0.62), cx + int(r * 0.72), cy - int(r * 0.4)],
        fill=TEAL,
    )


def scene_title(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    a = fade_hint(t, 0.0)
    s = ease_out(t / 0.8)
    r = int(70 * (0.6 + 0.4 * s))
    layer = new_layer()
    ld = ImageDraw.Draw(layer)
    draw_logo_mark(ld, W // 2, 250, r)
    dim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dim)
    dd.rectangle([0, 0, W, H], fill=(255, 255, 255, a))
    layer = Image.composite(layer, new_layer(), dim)
    paste_alpha(img, layer)
    od.text(
        (W // 2 - od.textlength("ophixe", font=F_TITLE) / 2, 350),
        "ophixe",
        font=F_TITLE,
        fill=WHITE,
    )
    od.text(
        (
            W // 2 - od.textlength("YOUR COMPANY'S WORK HUB", font=F_KICK) / 2,
            440,
        ),
        "YOUR COMPANY'S WORK HUB",
        font=F_KICK,
        fill=TEAL,
    )
    sub = "A 50-second tour — watch how your team joins and works."
    od.text(
        (W // 2 - od.textlength(sub, font=F_SUB) / 2, 490),
        sub,
        font=F_SUB,
        fill=SUB,
    )
    return img


def scene_signup(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    sx, top, sw = draw_phone(od, "WELCOME")
    cx, cw = sx + 24, sw - 48
    y = top + 24
    # Logo dot + heading.
    od.ellipse([cx, y, cx + 40, y + 40], fill=(0, 0, 0))
    od.ellipse([cx, y, cx + 40, y + 40], outline=TEAL, width=2)
    od.text((cx + 52, y + 2), "Create account", font=F_PHONE_B, fill=WHITE)
    y += 62
    email_full, pw_full = "adaeze@company.com", "........"
    n_e = min(len(email_full), int(t / 0.09))
    n_p = min(len(pw_full), max(0, int((t - 1.8) / 0.12)))
    blink = (t * 2) % 1 < 0.6
    paste_alpha(img, draw_field(od, cx, y, cw, "EMAIL ADDRESS", email_full[:n_e], 255, blink and n_p == 0))
    y += 92
    paste_alpha(img, draw_field(od, cx, y, cw, "PASSWORD", pw_full[:n_p], 255, blink and n_e >= len(email_full)))
    y += 96
    paste_alpha(img, draw_button(od, cx, y, cw, "Create account", fade_hint(t, 3.4)))
    y += 60
    paste_alpha(img, draw_button(od, cx, y, cw, "Continue with Google", fade_hint(t, 3.9), ghost=True))
    draw_caption(
        img, t, "STEP 1 OF 6", "Create your account",
        "Sign up with your work email in under a minute. Google sign-in works too.",
        1, 8,
    )
    return img


def scene_join(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    sx, top, sw = draw_phone(od, "JOIN COMMUNITY")
    cx, cw = sx + 24, sw - 48
    y = top + 30
    od.text((cx, y), "Enter the invite code", font=F_PHONE_B, fill=WHITE)
    od.text((cx, y + 24), "from your admin or HR.", font=F_PHONE_S, fill=SUB)
    y += 66
    code = "K7Q2XD"
    n = min(len(code), int(t / 0.35))
    box, gap = 38, 6
    for i in range(6):
        bx = cx + i * (box + gap)
        ch = code[i] if i < n else ""
        od.rounded_rectangle([bx, y, bx + box, y + 52], radius=10, fill=CARD)
        if ch:
            tw = od.textlength(ch, font=F_CODE)
            od.text((bx + (box - tw) / 2, y + 8), ch, font=F_CODE, fill=WHITE)
    y += 78
    card_a = fade_hint(t, 2.4)
    if card_a:
        layer = new_layer()
        ld = ImageDraw.Draw(layer)
        ld.rounded_rectangle([cx, y, cx + cw, y + 96], radius=14, fill=CARD + (card_a,))
        ld.ellipse([cx + 12, y + 14, cx + 52, y + 54], fill=TEAL + (card_a,))
        ld.text((cx + 62, y + 14), "Lagos HQ", font=F_PHONE_B, fill=WHITE + (card_a,))
        ld.text((cx + 62, y + 36), "128 staff  -  Admin approval", font=F_PHONE_S, fill=SUB + (card_a,))
        ld.text((cx + 12, y + 64), "Your request goes to an admin.", font=F_PHONE_S, fill=SUB + (card_a,))
        paste_alpha(img, layer)
    y += 112
    ok_a = fade_hint(t, 3.4)
    if ok_a:
        layer = new_layer()
        ld = ImageDraw.Draw(layer)
        ld.rounded_rectangle([cx, y, cx + cw, y + 52], radius=12, fill=CARD + (ok_a,))
        ld.text((cx + 12, y + 8), "Request approved. Welcome!", font=F_PHONE, fill=WHITE + (ok_a,))
        ld.text((cx + 12, y + 28), "You are now a staff member.", font=F_PHONE_S, fill=TEAL + (ok_a,))
        paste_alpha(img, layer)
    draw_tabs(od, sx, sw, 2)
    draw_caption(
        img, t, "STEP 2 OF 6", "Join your company",
        "Type the invite code. An admin approves you, and the whole hub unlocks.",
        2, 8,
    )
    return img


def scene_feed(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    sx, top, sw = draw_phone(od, "HOME")
    cx, cw = sx + 16, sw - 32
    y = top + 14
    posts = [
        ("Adaeze O.", "2h", ["Town hall moved to Friday,", "10am in the main hall."], True),
        ("HR Team", "5h", ["Payslips are ready.", "Confirm yours in Forms."], False),
    ]
    for i, (name, when, lines, liked) in enumerate(posts):
        at = 0.4 + i * 1.1
        a = fade_hint(t, at)
        dy = rise_offset(t, at)
        if a:
            layer = new_layer()
            ld = ImageDraw.Draw(layer)
            h = draw_post_card(ld, cx, y + dy, cw, name, when, lines, liked and t > at + 1.2)
            dim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(dim).rectangle([0, 0, W, H], fill=(255, 255, 255, a))
            paste_alpha(img, Image.composite(layer, new_layer(), dim))
            y += h + 12
        else:
            y += 12
    draw_tabs(od, sx, sw, 2)
    draw_caption(
        img, t, "STEP 3 OF 6", "Follow the Home feed",
        "Posts, announcements and events from your company — like, comment, share.",
        3, 8,
    )
    return img


def scene_chat(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    sx, top, sw = draw_phone(od, "CHAT")
    cx, cw = sx + 16, sw - 32
    y = top + 16
    msgs = [
        (["Morning! Is the stock", "report ready?"], False, 0.4),
        (["Almost — sending it", "after lunch."], True, 1.5),
        (["Perfect, thanks!"], False, 2.6),
    ]
    for lines, mine, at in msgs:
        a = fade_hint(t, at)
        dy = rise_offset(t, at)
        if not a:
            continue
        bw = 190
        bx = cx + cw - bw if mine else cx
        layer = new_layer()
        ld = ImageDraw.Draw(layer)
        h = draw_bubble(ld, bx, y + dy, bw, lines, mine)
        dim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(dim).rectangle([0, 0, W, H], fill=(255, 255, 255, a))
        paste_alpha(img, Image.composite(layer, new_layer(), dim))
        y += h + 10
    lock_a = fade_hint(t, 3.6)
    if lock_a:
        msg = "End-to-end encrypted"
        tw = od.textlength(msg, font=F_PHONE_S)
        od.rounded_rectangle(
            [sx + (sw - tw) / 2 - 14, y + 4, sx + (sw + tw) / 2 + 14, y + 30],
            radius=12, fill=CARD,
        )
        od.text((sx + (sw - tw) / 2, y + 8), msg, font=F_PHONE_S, fill=TEAL)
    # Composer.
    od.rounded_rectangle([cx, PY + PH - 8 - 56 - 52, cx + cw - 56, PY + PH - 8 - 56 - 12], radius=20, fill=CARD)
    od.text((cx + 14, PY + PH - 8 - 56 - 44), "Message...", font=F_PHONE, fill=SUB)
    od.ellipse([cx + cw - 44, PY + PH - 8 - 56 - 52, cx + cw - 4, PY + PH - 8 - 56 - 12], fill=TEAL)
    draw_tabs(od, sx, sw, 1)
    draw_caption(
        img, t, "STEP 4 OF 6", "Chat with your team",
        "Encrypted DMs with coworkers, team groups, replies and read receipts.",
        4, 8,
    )
    return img


def scene_calls(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    sx, top, sw = draw_phone(od, "MEETING ROOM")
    cx = sx + sw / 2
    y = top + 40
    # Remote tiles.
    a0 = fade_hint(t, 0.3)
    if a0:
        od.rounded_rectangle([sx + 20, y, sx + sw - 20, y + 150], radius=14, fill=CARD)
        od.ellipse([cx - 34, y + 28, cx + 34, y + 96], fill=TEAL)
        od.text((cx - 40, y + 104), "Adaeze O.", font=F_PHONE_B, fill=WHITE)
    y += 166
    a1 = fade_hint(t, 1.2)
    if a1:
        od.rounded_rectangle([sx + 20, y, sx + sw - 20, y + 120], radius=14, fill=(0, 0, 0))
        od.rounded_rectangle([sx + 20, y, sx + sw - 20, y + 120], radius=14, outline=BORDER, width=1)
        od.text((cx - 24, y + 48), "You", font=F_PHONE_B, fill=WHITE)
    # Controls.
    ca = fade_hint(t, 2.0)
    if ca:
        layer = new_layer()
        ld = ImageDraw.Draw(layer)
        cy = PY + PH - 8 - 56 - 40
        for i, fill in enumerate([CARD, CARD, (200, 40, 50)]):
            bx = cx - 76 + i * 76
            ld.ellipse([bx - 24, cy - 24, bx + 24, cy + 24], fill=fill + (ca,))
        ld.text((cx - 76 - 16, cy - 10), "Mic", font=F_PHONE_S, fill=WHITE + (ca,))
        ld.text((cx - 14, cy - 10), "Cam", font=F_PHONE_S, fill=WHITE + (ca,))
        ld.text((cx + 76 - 14, cy - 10), "End", font=F_PHONE_S, fill=WHITE + (ca,))
        paste_alpha(img, layer)
    draw_tabs(od, sx, sw, 3)
    draw_caption(
        img, t, "STEP 5 OF 6", "Meet face to face",
        "Voice and video calls plus meeting rooms your whole team can drop into.",
        5, 8,
    )
    return img


def scene_more(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    sx, top, sw = draw_phone(od, "TEAMS")
    cx, cw = sx + 16, sw - 32
    mods = [
        ("Tasks", "12 open"),
        ("Forms", "3 pending"),
        ("Wallet", "Dues paid"),
        ("Events", "Fri 10am"),
        ("Files", "Shared docs"),
        ("Polls", "Vote now"),
    ]
    gap = 12
    gw = (cw - gap) / 2
    y0 = top + 20
    for i, (name, sub) in enumerate(mods):
        at = 0.3 + i * 0.35
        a = fade_hint(t, at)
        dy = rise_offset(t, at)
        if not a:
            continue
        col, row = i % 2, i // 2
        gx = cx + col * (gw + gap)
        gy = y0 + row * 108 + dy
        layer = new_layer()
        ld = ImageDraw.Draw(layer)
        ld.rounded_rectangle([gx, gy, gx + gw, gy + 96], radius=14, fill=CARD + (a,))
        ld.ellipse([gx + 12, gy + 12, gx + 40, gy + 40], fill=TEAL + (a,))
        ld.text((gx + 12, gy + 48), name, font=F_PHONE_B, fill=WHITE + (a,))
        ld.text((gx + 12, gy + 68), sub, font=F_PHONE_S, fill=SUB + (a,))
        paste_alpha(img, layer)
    draw_tabs(od, sx, sw, 3)
    draw_caption(
        img, t, "STEP 6 OF 6", "Run the whole office",
        "Tasks, approvals, forms, wallet dues, files and events — one hub.",
        6, 8,
    )
    return img


def scene_end(t, dur):
    img = Image.new("RGBA", (W, H), BG + (255,))
    od = ImageDraw.Draw(img)
    layer = new_layer()
    draw_logo_mark(ImageDraw.Draw(layer), W // 2, 210, 64)
    paste_alpha(img, layer)
    title = "Get Ophixe today"
    od.text(
        (W // 2 - od.textlength(title, font=F_TITLE) / 2, 300),
        title, font=F_TITLE, fill=WHITE,
    )
    sub = "Download the app, enter your invite code, and join your team."
    od.text(
        (W // 2 - od.textlength(sub, font=F_SUB) / 2, 390),
        sub, font=F_SUB, fill=SUB,
    )
    # Store buttons.
    bw, bh, gap = 250, 64, 20
    x0 = W // 2 - bw - gap / 2
    y0 = 470
    od.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=14, fill=WHITE)
    label = "Download for Android"
    od.text(
        (x0 + (bw - od.textlength(label, font=F_PHONE_B)) / 2, y0 + 20),
        label, font=F_PHONE_B, fill=INK,
    )
    od.rounded_rectangle(
        [x0 + bw + gap, y0, x0 + 2 * bw + gap, y0 + bh],
        radius=14, outline=SUB, width=2,
    )
    label2 = "Download for iPhone"
    od.text(
        (x0 + bw + gap + (bw - od.textlength(label2, font=F_PHONE_B)) / 2, y0 + 20),
        label2, font=F_PHONE_B, fill=WHITE,
    )
    return img


TIMELINE = [
    (4.0, scene_title),
    (6.0, scene_signup),
    (8.0, scene_join),
    (7.0, scene_feed),
    (8.0, scene_chat),
    (6.0, scene_calls),
    (6.0, scene_more),
    (5.0, scene_end),
]
XFADE = 0.5  # crossfade seconds between scenes


def frame_at(time_s: float) -> Image.Image:
    """Render the composited frame at absolute time, with crossfades."""
    bounds = []
    cursor = 0.0
    for dur, fn in TIMELINE:
        bounds.append((cursor, cursor + dur, fn))
        cursor += dur
    total = cursor
    t = min(max(time_s, 0.0), total - 1e-6)
    for i, (start, end, fn) in enumerate(bounds):
        if start <= t < end:
            local = t - start
            img = fn(local, end - start)
            # Crossfade out into the next scene.
            if i + 1 < len(bounds) and local > (end - start) - XFADE:
                nxt = bounds[i + 1][2](0.0, bounds[i + 1][1] - bounds[i + 1][0])
                k = (local - ((end - start) - XFADE)) / XFADE
                img = Image.blend(img.convert("RGB"), nxt.convert("RGB"), clamp(k)).convert("RGBA")
            return img.convert("RGB")
    return bounds[-1][2](0.0, 1.0).convert("RGB")


def main():
    total = sum(d for d, _ in TIMELINE)
    n_frames = int(total * FPS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    print(f"Rendering {n_frames} frames ({total:.1f}s @ {FPS}fps)...", flush=True)
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
        "-framerate", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        "-movflags", "+faststart", OUT,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert proc.stdin is not None
    poster_saved = False
    for i in range(n_frames):
        img = frame_at(i / FPS)
        if not poster_saved and i > 2 * FPS:
            img.save(POSTER)
            poster_saved = True
        proc.stdin.write(img.tobytes())
        if (i + 1) % (FPS * 5) == 0:
            print(f"  {(i + 1) / FPS:.0f}s / {total:.0f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        print("ffmpeg failed", file=sys.stderr)
        sys.exit(1)
    size_mb = os.path.getsize(OUT) / 1e6
    print(f"Done: {OUT} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
