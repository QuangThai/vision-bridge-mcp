"""Generate golden fixture PNGs with rendered text using Pillow."""
from PIL import Image, ImageDraw, ImageFont
import os

FONTS_DIR = "C:/Windows/Fonts"
ARIAL = os.path.join(FONTS_DIR, "arial.ttf")
MSGOTHIC = os.path.join(FONTS_DIR, "msgothic.ttc")
MALGUN = os.path.join(FONTS_DIR, "malgun.ttf")
OUTPUT_DIR = "tests/fixtures/golden"


def make_vietnamese():
    """Vietnamese text fixture."""
    img = Image.new("RGB", (1280, 900), "white")
    draw = ImageDraw.Draw(img)

    f_title = ImageFont.truetype(ARIAL, 28)
    f_body = ImageFont.truetype(ARIAL, 18)
    f_small = ImageFont.truetype(ARIAL, 14)
    f_sub = ImageFont.truetype(ARIAL, 22)

    y = 30
    draw.text((40, y), "Chào mừng đến với trang web tiếng Việt", fill=(192, 57, 43), font=f_title)
    y += 50
    draw.text((40, y), "Đây là đoạn văn bản tiếng Việt với đầy đủ dấu.", fill=(50, 50, 50), font=f_body)
    y += 35
    draw.text((40, y), "Các ký tự có dấu: à, á, ả, ã, ạ, ă, â, đ, ê, ô, ơ, ư", fill=(50, 50, 50), font=f_body)
    y += 45

    # Note box
    draw.rectangle([(40, y), (1240, y + 90)], fill=(255, 243, 205), outline=(255, 193, 7), width=2)
    draw.text((60, y + 10), "Lưu ý quan trọng: Dấu thanh thay đổi nghĩa của từ!", fill=(133, 100, 4), font=f_body)
    draw.text((60, y + 40), "bò (cow) ≠ bỏ (quit) ≠ bõ (worthwhile) ≠ bộ (ministry)", fill=(39, 174, 96), font=f_small)

    y += 120
    draw.text((40, y), "Ví dụ câu tiếng Việt:", fill=(41, 128, 185), font=f_sub)
    y += 40
    for line in [
        "Cộng hòa Xã hội Chủ nghĩa Việt Nam là một quốc gia ở Đông Nam Á.",
        "Thủ đô Hà Nội là trung tâm chính trị, văn hóa của cả nước.",
        "Thành phố Hồ Chí Minh là trung tâm kinh tế lớn nhất Việt Nam.",
        "Ẩm thực Việt Nam nổi tiếng với phở, bánh mì, nem rán và cà phê sữa đá.",
    ]:
        draw.text((40, y), line, fill=(50, 50, 50), font=f_body)
        y += 30

    y += 20
    draw.text((40, y), "Câu phức tạp với nhiều dấu:", fill=(41, 128, 185), font=ImageFont.truetype(ARIAL, 20))
    y += 35
    complex_lines = [
        "Những người nông dân Việt Nam đã cải tiến kỹ thuật trồng lúa nước",
        "để tăng năng suất, góp phần đưa Việt Nam trở thành một trong",
        "những nước xuất khẩu gạo hàng đầu thế giới.",
    ]
    for line in complex_lines:
        draw.text((40, y), line, fill=(50, 50, 50), font=f_body)
        y += 30

    path = os.path.join(OUTPUT_DIR, "vietnamese-text.png")
    img.save(path)
    print(f"Created {path}")


def make_cjk():
    """CJK text fixture."""
    img = Image.new("RGB", (1280, 900), "white")
    draw = ImageDraw.Draw(img)

    f_title = ImageFont.truetype(ARIAL, 26)
    f_jp = ImageFont.truetype(MSGOTHIC, 18)
    f_cn = ImageFont.truetype(ARIAL, 16)
    f_kr = ImageFont.truetype(MALGUN, 18)
    f_sub = ImageFont.truetype(ARIAL, 20)

    y = 25
    draw.text((40, y), "日本語・中文・한국어 Sample Text", fill=(142, 68, 173), font=f_title)
    y += 45

    # Japanese
    draw.rectangle([(40, y), (1240, y + 200)], fill=(245, 245, 245), outline=(142, 68, 173), width=1)
    draw.text((60, y + 10), "日本語 (Japanese)", fill=(142, 68, 173), font=f_sub)
    for i, line in enumerate([
        "こんにちは、世界！これは日本語のサンプルテキストです。",
        "日本語はひらがな・カタカナ・漢字を混在して使用します。",
        "例：「私は昨日、東京駅で友達と会いました。」",
        "ひらがな：あいうえお かきくけこ さしすせそ",
        "カタカナ：アイウエオ カキクケコ サシスセソ",
    ]):
        draw.text((60, y + 40 + i * 30), line, fill=(50, 50, 50), font=f_jp)

    y += 220

    # Chinese
    draw.rectangle([(40, y), (1240, y + 180)], fill=(254, 249, 231), outline=(211, 84, 0), width=1)
    draw.text((60, y + 10), "中文 (Chinese)", fill=(211, 84, 0), font=f_sub)
    for i, line in enumerate([
        "你好，世界！这是中文的样本文本。",
        "中文使用汉字（简体字）进行书写，不使用字母或音节文字。",
        "例如：「人工智能正在改变世界的运作方式。」",
        "中国的四大发明包括造纸术、印刷术、火药和指南针。",
    ]):
        draw.text((60, y + 40 + i * 30), line, fill=(50, 50, 50), font=f_cn)

    y += 200

    # Korean
    draw.rectangle([(40, y), (1240, y + 180)], fill=(234, 250, 241), outline=(39, 174, 96), width=1)
    draw.text((60, y + 10), "한국어 (Korean)", fill=(39, 174, 96), font=f_sub)
    for i, line in enumerate([
        "안녕하세요, 세계! 이것은 한국어 샘플 텍스트입니다.",
        "한국어는 한글을 사용하여 표기합니다.",
        "예: 「저는 어제 서울에서 친구를 만났습니다。」",
        "한글 자음: ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ",
    ]):
        draw.text((60, y + 40 + i * 30), line, fill=(50, 50, 50), font=f_kr)

    path = os.path.join(OUTPUT_DIR, "cjk-text.png")
    img.save(path)
    print(f"Created {path}")


def make_ui_components():
    """UI components fixture."""
    img = Image.new("RGB", (1280, 900), "#f5f5f5")
    draw = ImageDraw.Draw(img)

    f_title = ImageFont.truetype(ARIAL, 24)
    f_body = ImageFont.truetype(ARIAL, 14)
    f_small = ImageFont.truetype(ARIAL, 12)
    f_section = ImageFont.truetype(ARIAL, 12)
    f_card = ImageFont.truetype(ARIAL, 15)

    draw.text((40, 25), "UI Components", fill=(50, 50, 50), font=f_title)

    # Navigation bar
    draw.rectangle([(0, 60), (1280, 100)], fill="white", outline="#e0e0e0")
    for i, item in enumerate(["Dashboard", "Settings", "Profile", "Notifications"]):
        x = 40 + i * 120
        color = "#007aff" if i == 0 else "#666666"
        draw.text((x, 72), item, fill=color, font=f_body)
        if i == 0:
            draw.rectangle([(x, 96), (x + 75, 100)], fill="#007aff")

    y = 120

    # Buttons
    draw.rectangle([(20, y), (1260, y + 100)], fill="white", outline="#e0e0e0")
    draw.text((40, y + 10), "BUTTONS", fill=(100, 100, 100), font=f_section)
    buttons = [
        (40, "Default", (80, 80, 80), (230, 230, 230)),
        (125, "Primary", (255, 255, 255), (0, 122, 255)),
        (210, "Delete", (255, 255, 255), (255, 59, 48)),
        (295, "Save", (255, 255, 255), (52, 199, 89)),
        (375, "Outline", (0, 122, 255), (255, 255, 255)),
    ]
    for bx, label, fc, bg in buttons:
        tw = len(label) * 8
        draw.rounded_rectangle([(bx, y + 35), (bx + tw + 16, y + 63)], radius=6, fill=bg)
        draw.text((bx + 8, y + 42), label, fill=fc, font=f_body)

    y += 120

    # Form
    draw.rectangle([(20, y), (1260, y + 160)], fill="white", outline="#e0e0e0")
    draw.text((40, y + 10), "FORM INPUTS", fill=(100, 100, 100), font=f_section)
    draw.text((40, y + 35), "Email", fill=(80, 80, 80), font=f_small)
    draw.rounded_rectangle([(40, y + 50), (600, y + 70)], radius=6, fill="white", outline="#ddd")
    draw.text((50, y + 54), "john@example.com", fill=(100, 100, 100), font=f_small)
    draw.text((40, y + 80), "Password", fill=(80, 80, 80), font=f_small)
    draw.rounded_rectangle([(40, y + 95), (600, y + 115)], radius=6, fill="white", outline="#ddd")
    draw.text((50, y + 99), "••••••••", fill=(100, 100, 100), font=f_small)
    draw.text((40, y + 130), "Remember me", fill=(80, 80, 80), font=f_small)
    draw.text((170, y + 130), "Option A", fill=(80, 80, 80), font=f_small)

    y += 180

    # Cards
    draw.rectangle([(20, y), (1260, y + 160)], fill="white", outline="#e0e0e0")
    draw.text((40, y + 10), "CARDS", fill=(100, 100, 100), font=f_section)
    for ci, (title, desc) in enumerate([
        ("Getting Started", "Learn the basics of using this platform."),
        ("API Reference", "Explore API docs with code examples."),
        ("Templates", "Pre-built templates for common use cases."),
    ]):
        cx = 40 + ci * 400
        draw.rounded_rectangle([(cx, y + 35), (cx + 370, y + 145)], radius=8, fill="white", outline="#e0e0e0")
        draw.text((cx + 15, y + 50), title, fill=(40, 40, 40), font=f_card)
        draw.text((cx + 15, y + 80), desc, fill=(100, 100, 100), font=f_small)

    y += 180

    # Chips & badges
    draw.rectangle([(20, y), (1260, y + 80)], fill="white", outline="#e0e0e0")
    draw.text((40, y + 10), "CHIPS & BADGES", fill=(100, 100, 100), font=f_section)
    chips = [
        (40, "React", (232, 240, 254), (26, 115, 232)),
        (100, "TypeScript", (230, 244, 234), (30, 142, 62)),
        (190, "Deprecated", (252, 232, 230), (217, 48, 37)),
        (280, "New", (26, 115, 232), (255, 255, 255)),
        (330, "Active", (52, 168, 83), (255, 255, 255)),
    ]
    for cx, label, bg, fg in chips:
        tw = len(label) * 8
        draw.rounded_rectangle([(cx, y + 35), (cx + tw + 12, y + 57)], radius=10, fill=bg)
        draw.text((cx + 6, y + 40), label, fill=fg, font=f_small)

    path = os.path.join(OUTPUT_DIR, "ui-components.png")
    img.save(path)
    print(f"Created {path}")


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    make_vietnamese()
    make_cjk()
    make_ui_components()
    print("\nAll golden fixtures created!")
