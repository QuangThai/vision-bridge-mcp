"""
Generate additional golden fixtures:
1. Receipt fixture for OCR stress testing (dense text, table-like)
2. Before/after image pair for compare_images visual diff testing
"""
from PIL import Image, ImageDraw, ImageFont
import os

FONTS_DIR = "C:/Windows/Fonts"
ARIAL = os.path.join(FONTS_DIR, "arial.ttf")
ARIAL_BD = os.path.join(FONTS_DIR, "arialbd.ttf")
OUTPUT_DIR = "tests/fixtures/golden"


def make_receipt():
    """Dense store receipt for OCR stress testing."""
    img = Image.new("RGB", (600, 900), "white")
    draw = ImageDraw.Draw(img)

    f_title = ImageFont.truetype(ARIAL_BD, 22)
    f_header = ImageFont.truetype(ARIAL_BD, 14)
    f_body = ImageFont.truetype(ARIAL, 13)
    f_small = ImageFont.truetype(ARIAL, 11)
    f_total = ImageFont.truetype(ARIAL_BD, 16)
    f_footer = ImageFont.truetype(ARIAL, 10)

    # Receipt header
    draw.rectangle([(0, 0), (600, 160)], fill="#f8f8f8")
    draw.text((180, 25), "GREEN GROCER", fill=(46, 125, 50), font=f_title)
    draw.text((150, 55), "123 Main Street, Springfield", fill=(80, 80, 80), font=f_body)
    draw.text((160, 75), "Tel: (555) 123-4567", fill=(80, 80, 80), font=f_body)
    draw.text((130, 100), "OPEN Mon-Sat 8:00-20:00", fill=(80, 80, 80), font=f_small)
    draw.text((155, 120), "Receipt #: 004829-AB", fill=(40, 40, 40), font=f_body)
    draw.text((175, 140), "Date: 2026-06-15 14:32", fill=(40, 40, 40), font=f_body)

    # Dashed separator
    for i in range(0, 600, 6):
        draw.rectangle([(i, 168), (i + 3, 170)], fill=(180, 180, 180))

    # Column headers
    y = 178
    draw.text((20, y), "QTY", fill=(100, 100, 100), font=f_small)
    draw.text((55, y), "ITEM", fill=(100, 100, 100), font=f_small)
    draw.text((370, y), "PRICE", fill=(100, 100, 100), font=f_small)
    draw.text((460, y), "TOTAL", fill=(100, 100, 100), font=f_small)

    # Items
    items = [
        (2, "Organic Bananas (1lb)", 1.49, 2.98),
        (1, "Avocado Hass", 1.99, 1.99),
        (3, "Red Bell Pepper", 0.89, 2.67),
        (1, "Baby Spinach 5oz", 3.49, 3.49),
        (2, "Almond Milk 64oz", 4.49, 8.98),
        (1, "Sourdough Bread", 5.29, 5.29),
        (4, "Greek Yogurt 6pk", 6.99, 27.96),
        (1, "Free Range Eggs 12pk", 6.49, 6.49),
        (2, "Organic Chicken Breast", 8.99, 17.98),
        (1, "Salmon Fillet 8oz", 12.99, 12.99),
        (3, "Sweet Potato (1lb)", 1.29, 3.87),
        (1, "Quinoa 16oz", 4.99, 4.99),
        (2, "Dark Chocolate Bar", 3.99, 7.98),
        (1, "Sparkling Water 12pk", 5.49, 5.49),
        (3, "Fresh Basil", 2.49, 7.47),
    ]

    y = 195
    line_h = 22
    for qty, item, price, total in items:
        draw.text((20, y), str(qty), fill=(40, 40, 40), font=f_body)
        draw.text((55, y), item, fill=(40, 40, 40), font=f_body)
        draw.text((370, y), f"${price:.2f}", fill=(40, 40, 40), font=f_body)
        draw.text((460, y), f"${total:.2f}", fill=(40, 40, 40), font=f_body)
        y += line_h

    # Separator
    for i in range(0, 600, 6):
        draw.rectangle([(i, y + 2), (i + 3, y + 4)], fill=(180, 180, 180))

    y += 12

    # Subtotal / tax / total
    subtotal = sum(t for _, _, _, t in items)
    tax = round(subtotal * 0.08, 2)
    total = subtotal + tax

    draw.text((350, y), "SUBTOTAL:", fill=(60, 60, 60), font=f_body)
    draw.text((460, y), f"${subtotal:.2f}", fill=(60, 60, 60), font=f_body)
    y += 22

    draw.text((350, y), "TAX (8%):", fill=(100, 100, 100), font=f_body)
    draw.text((460, y), f"${tax:.2f}", fill=(100, 100, 100), font=f_body)
    y += 22

    draw.text((350, y), "TOTAL:", fill=(40, 40, 40), font=f_total)
    draw.text((440, y), f"${total:.2f}", fill=(217, 48, 37), font=f_total)
    y += 28

    # Payment info
    draw.text((20, y), "Payment: VISA **** 4829", fill=(80, 80, 80), font=f_body)
    y += 20
    draw.text((20, y), "Amount Tendered: $120.00", fill=(80, 80, 80), font=f_body)
    y += 20
    draw.text((20, y), "Change: $2.18", fill=(80, 80, 80), font=f_body)
    y += 20

    # Rewards
    draw.text((20, y), "Rewards points earned: 118", fill=(46, 125, 50), font=f_small)
    y += 18
    draw.text((20, y), "Total points balance: 2,450", fill=(46, 125, 50), font=f_small)

    y += 30
    # Footer
    for i in range(0, 600, 6):
        draw.rectangle([(i, y), (i + 3, y + 2)], fill=(180, 180, 180))

    y += 15
    draw.text((130, y), "Thank you for shopping with us!", fill=(100, 100, 100), font=f_footer)
    y += 16
    draw.text((160, y), "Please take your receipt", fill=(100, 100, 100), font=f_footer)
    y += 16
    draw.text((140, y), "Need help? Contact support@greengrocer.com", fill=(100, 100, 100), font=f_footer)

    path = os.path.join(OUTPUT_DIR, "receipt.png")
    img.save(path)
    print(f"Created {path}")


def make_before_after():
    """Before/after image pair for compare_images visual diff testing."""
    W, H = 800, 600

    # ---- BEFORE ----
    img = Image.new("RGB", (W, H), "#f0f2f5")
    draw = ImageDraw.Draw(img)

    f_title = ImageFont.truetype(ARIAL_BD, 28)
    f_sub = ImageFont.truetype(ARIAL, 16)
    f_body = ImageFont.truetype(ARIAL, 14)
    f_label = ImageFont.truetype(ARIAL, 12)

    # Header bar
    draw.rectangle([(0, 0), (W, 60)], fill="#1a73e8")
    draw.text((30, 15), "My Dashboard", fill="white", font=f_sub)
    draw.rounded_rectangle([(650, 12), (770, 48)], radius=4, fill="white")
    draw.text((665, 20), "John Doe", fill="#1a73e8", font=f_label)

    # Stats cards
    cards_data = [
        (30, 80, 230, 180, "Total Revenue", "$48,290", "#e8f0fe", "#1a73e8"),
        (270, 80, 470, 180, "Active Users", "2,847", "#e6f4ea", "#34a853"),
        (510, 80, 710, 180, "Orders", "1,203", "#fef7e0", "#f9ab00"),
        (30, 200, 470, 400, "Sales Overview", "Chart placeholder\nMonthly trend: +12.5%", "#ffffff", "#5f6368"),
        (510, 200, 770, 400, "Recent Activity", "", "#ffffff", "#5f6368"),
    ]

    for x1, y1, x2, y2, label, value, bg, fc in cards_data:
        draw.rounded_rectangle([(x1, y1), (x2, y2)], radius=8, fill=bg, outline="#e0e0e0")
        draw.text((x1 + 15, y1 + 12), label, fill="#5f6368", font=f_label)
        draw.text((x1 + 15, y1 + 32), value, fill=fc, font=f_title if "$" in value else f_sub)

        if label == "Sales Overview":
            # Draw a simple placeholder chart
            points = [(x1 + 20, y1 + 110), (x1 + 150, y1 + 85), (x1 + 280, y1 + 100),
                      (x1 + 310, y1 + 60), (x1 + 360, y1 + 75)]
            for i in range(len(points) - 1):
                draw.line([points[i], points[i + 1]], fill="#1a73e8", width=2)
            draw.text((x1 + 150, y1 + 135), "+12.5% vs last month", fill="#34a853", font=f_label)
        elif label == "Recent Activity":
            activities = [
                "• User jane@co.com signed up",
                "• Order #4829 completed",
                "• Payment of $299 received",
                "• New deployment v2.1",
                "• SSL cert renewed",
            ]
            for i, act in enumerate(activities):
                draw.text((x1 + 15, y1 + 35 + i * 25), act, fill="#5f6368", font=f_body)

    path = os.path.join(OUTPUT_DIR, "dashboard-before.png")
    img.save(path)
    print(f"Created {path}")

    # ---- AFTER (with changes) ----
    img2 = Image.new("RGB", (W, H), "#f0f2f5")
    draw2 = ImageDraw.Draw(img2)

    # Header bar (changed color)
    draw2.rectangle([(0, 0), (W, 60)], fill="#0d47a1")
    draw2.text((30, 15), "My Dashboard v2", fill="white", font=f_sub)  # Title changed
    # User avatar added
    draw2.ellipse([(650, 12), (695, 48)], fill="#bbdefb")
    draw2.text((660, 20), "JD", fill="#0d47a1", font=f_label)

    # Stats cards (values changed)
    cards_data2 = [
        (30, 80, 230, 180, "Total Revenue", "$52,140", "#e8f0fe", "#1a73e8"),
        (270, 80, 470, 180, "Active Users", "3,124", "#e6f4ea", "#34a853"),
        (510, 80, 710, 180, "Orders", "1,487", "#fef7e0", "#f9ab00"),
        (30, 200, 470, 400, "Sales Overview", "Chart placeholder\nMonthly trend: +18.2%", "#ffffff", "#5f6368"),
        (510, 200, 770, 400, "Recent Activity", "", "#ffffff", "#5f6368"),
    ]

    for x1, y1, x2, y2, label, value, bg, fc in cards_data2:
        draw2.rounded_rectangle([(x1, y1), (x2, y2)], radius=8, fill=bg, outline="#e0e0e0")
        draw2.text((x1 + 15, y1 + 12), label, fill="#5f6368", font=f_label)
        draw2.text((x1 + 15, y1 + 32), value, fill=fc, font=f_title if "$" in value else f_sub)

        if label == "Sales Overview":
            # Chart line changed (higher)
            points = [(x1 + 20, y1 + 105), (x1 + 150, y1 + 80), (x1 + 280, y1 + 95),
                      (x1 + 310, y1 + 50), (x1 + 360, y1 + 65)]
            for i in range(len(points) - 1):
                draw2.line([points[i], points[i + 1]], fill="#1a73e8", width=2)
            draw2.text((x1 + 150, y1 + 135), "+18.2% vs last month", fill="#34a853", font=f_label)
            # Added extra annotation
            draw2.text((x1 + 20, y1 + 155), "Peak in Week 3", fill="#f9ab00", font=f_label)
        elif label == "Recent Activity":
            activities2 = [
                "• User jane@co.com signed up",
                "• Order #4829 completed",
                "• Payment of $299 received",
                "• New deployment v2.1.1",      # Changed
                "• SSL cert renewed (expires 2027)",  # Changed
                "• New team member added",       # Added
            ]
            for i, act in enumerate(activities2):
                draw2.text((x1 + 15, y1 + 35 + i * 25), act, fill="#5f6368", font=f_body)

    path = os.path.join(OUTPUT_DIR, "dashboard-after.png")
    img2.save(path)
    print(f"Created {path}")

    # ---- DIFF-ONLY image: highlight changes ----
    img3 = Image.new("RGB", (W, H), "#f0f2f5")
    draw3 = ImageDraw.Draw(img3)

    draw3.text((30, 30), "Visual Diff (changes highlighted)", fill="#333333", font=f_sub)
    draw3.text((30, 60), "Header color, title, user avatar, stat values, chart trend, activity log", fill="#666666", font=f_body)

    # Highlight regions around changes with red borders
    # Changed header
    draw3.rectangle([(0, 0), (W, 60)], outline="#d32f2f", width=3)
    draw3.text((10, 66), "Header changed", fill="#d32f2f", font=f_label)

    # Changed stat values
    changes = [("Revenue: +$3,850", 30, 190), ("Users: +277", 270, 190), ("Orders: +284", 510, 190)]
    for label, cx, cy in changes:
        draw3.rectangle([(cx, cy), (cx + 200, cy + 15)], outline="#d32f2f", width=2)
        draw3.text((cx, cy - 14), label, fill="#d32f2f", font=f_label)

    # Changed chart
    draw3.rectangle([(30, 200), (470, 400)], outline="#d32f2f", width=2)
    draw3.text((30, 405), "Chart data changed", fill="#d32f2f", font=f_label)

    # Changed activity items + new item
    draw3.rectangle([(510, 345), (770, 375)], outline="#d32f2f", width=2)  # Changed items
    draw3.line([(510, 375), (770, 375)], fill="#d32f2f", width=1)          # separator
    draw3.rectangle([(510, 375), (770, 400)], outline="#388e3c", width=2)  # New item (green)
    draw3.text((510, 405), "Modified items (red), New item (green)", fill="#666666", font=f_label)

    path = os.path.join(OUTPUT_DIR, "dashboard-diff.png")
    img3.save(path)
    print(f"Created {path}")


if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    make_receipt()
    make_before_after()
    print("\nAll extra golden fixtures created!")
