#!/usr/bin/env python3
"""Regenerate the plugin icon (SVG source + the two PNG sizes).

重新生成插件图标(SVG 源文件 + 两个 PNG 尺寸)。

图形是"刷新环 + 两条元数据横条",红色取 Zotero 品牌红,透明底 —— 深色/浅色
主题下都能看清,菜单里也不会像色块徽章那样突兀。几何全部算出来而不是手写路径,
所以箭头永远贴合圆弧末端的切线方向。

The mark is a refresh ring wrapped around two metadata bars, in Zotero's brand
red on a transparent ground — legible on both light and dark themes, and less
obtrusive in menus than a solid colour badge. The geometry is computed rather
than hand-written, so the arrowhead always sits tangent to the arc's end.

Usage:
    python3 tools/make_icons.py

Requires:
    cairosvg, pillow  (`pip install cairosvg pillow`)
"""

import io
import math
from pathlib import Path

import cairosvg
from PIL import Image

# 画布与配色 / canvas and palette
CANVAS = 96.0
CENTER = CANVAS / 2
RED = "#CC2936"
PADDING = 3.0

# 输出:文件名 → 边长(px)。必须与 addon/manifest.json 里声明的 icons 尺寸一致。
# Output: filename → edge length in px. Must match the sizes declared in
# addon/manifest.json's `icons`.
OUT_DIR = Path(__file__).resolve().parent.parent / "addon" / "content" / "icons"
PNG_SIZES = {"favicon.png": 96, "favicon@0.5x.png": 48}


def polar(angle_deg: float, radius: float) -> tuple[float, float]:
    """Convert polar coordinates to SVG screen coordinates.

    极坐标转 SVG 屏幕坐标(注意 y 轴向下)。

    Args:
        angle_deg: 角度,逆时针为正 / angle in degrees, counterclockwise positive.
        radius: 半径 / distance from the canvas centre.

    Returns:
        (x, y) 屏幕坐标 / the point in screen coordinates.
    """
    theta = math.radians(angle_deg)
    return CENTER + radius * math.cos(theta), CENTER - radius * math.sin(theta)


def arc_with_head(
    radius: float,
    width: float,
    start_deg: float,
    sweep_deg: float,
    head_ratio: float = 1.9,
    color: str = RED,
) -> str:
    """Build an open circular arc tipped with a tangential arrowhead.

    构建一段开口圆弧,末端接一个与切线对齐的箭头。

    Args:
        radius: 弧半径 / arc radius.
        width: 描边宽度 / stroke width.
        start_deg: 起始角度 / starting angle in degrees.
        sweep_deg: 扫过角度,正数为逆时针 / swept angle, positive = ccw.
        head_ratio: 箭头大小相对描边宽度的倍数 / arrowhead size vs stroke width.
        color: 填充与描边颜色 / stroke and fill colour.

    Returns:
        两段 SVG 路径拼成的字符串 / the arc and arrowhead as SVG markup.
    """
    x0, y0 = polar(start_deg, radius)
    end_deg = start_deg + sweep_deg
    x1, y1 = polar(end_deg, radius)
    large_arc = 1 if abs(sweep_deg) > 180 else 0
    # y 轴翻转 ⇒ 数学意义上的逆时针在 SVG 里对应 sweep-flag 0。
    # The flipped y axis means a mathematically ccw sweep is SVG sweep-flag 0.
    sweep_flag = 0 if sweep_deg > 0 else 1
    arc = (
        f'<path d="M {x0:.2f} {y0:.2f} A {radius} {radius} 0 '
        f'{large_arc} {sweep_flag} {x1:.2f} {y1:.2f}" fill="none" '
        f'stroke="{color}" stroke-width="{width}" stroke-linecap="butt"/>'
    )

    # 箭头以弧末端为基点:tangent 决定尖端方向,normal 决定两个底角。
    # The head is anchored at the arc tip: the tangent gives its point, the
    # normal gives its two base corners.
    tangent = math.radians(end_deg + 90 * (1 if sweep_deg > 0 else -1))
    tx, ty = math.cos(tangent), -math.sin(tangent)
    nx, ny = math.cos(math.radians(end_deg)), -math.sin(math.radians(end_deg))
    size = width * head_ratio
    tip = (x1 + tx * size * 0.95, y1 + ty * size * 0.95)
    left = (x1 + nx * size * 0.72, y1 + ny * size * 0.72)
    right = (x1 - nx * size * 0.72, y1 - ny * size * 0.72)
    head = (
        f'<path d="M {tip[0]:.2f} {tip[1]:.2f} L {left[0]:.2f} {left[1]:.2f} '
        f'L {right[0]:.2f} {right[1]:.2f} Z" fill="{color}"/>'
    )
    return f"{arc}\n    {head}"


def build_glyph() -> str:
    """Return the untransformed mark: refresh ring plus two metadata bars.

    返回未做变换的图形本体:刷新环 + 两条元数据横条。
    """
    ring = arc_with_head(radius=36, width=10, start_deg=55, sweep_deg=285)
    bars = (
        f'<g stroke="{RED}" stroke-width="8.5" stroke-linecap="round">'
        '<line x1="35" y1="40" x2="61" y2="40"/>'
        '<line x1="35" y1="56" x2="53" y2="56"/></g>'
    )
    return f"{ring}\n    {bars}"


def wrap(inner: str, scale: float = 1.0, dx: float = 0.0, dy: float = 0.0) -> str:
    """Wrap the mark in an SVG document, optionally scaled and translated.

    把图形包进 SVG 文档,可附加缩放与平移。
    """
    size = int(CANVAS)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}">\n'
        f'  <g transform="translate({dx:.3f} {dy:.3f}) scale({scale:.5f})">\n'
        f"    {inner}\n  </g>\n</svg>\n"
    )


def measure(svg: str) -> tuple[float, float, float, float]:
    """Measure the mark's alpha bounding box, in canvas units.

    测量图形的 alpha 包围盒(以画布单位计)。

    以 10 倍分辨率栅格化再除回来,避免 96px 下的取整误差。
    Rasterised at 10× and divided back, so 96px rounding can't skew the fit.
    """
    png = cairosvg.svg2png(
        bytestring=svg.encode(), output_width=960, output_height=960
    )
    bbox = Image.open(io.BytesIO(png)).getchannel("A").getbbox()
    return tuple(v / 10.0 for v in bbox)


def main() -> None:
    """Fit the mark to the canvas, then write the SVG and the PNG sizes.

    把图形适配到画布,然后写出 SVG 与各个 PNG 尺寸。
    """
    glyph = build_glyph()
    x0, y0, x1, y1 = measure(wrap(glyph))

    # 等比缩放到留出 PADDING 的方框内,再居中 / fit inside the padded box, centred.
    available = CANVAS - 2 * PADDING
    scale = available / max(x1 - x0, y1 - y0)
    dx = PADDING + (available - (x1 - x0) * scale) / 2 - x0 * scale
    dy = PADDING + (available - (y1 - y0) * scale) / 2 - y0 * scale
    svg = wrap(glyph, scale, dx, dy)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    svg_path = OUT_DIR / "favicon.svg"
    svg_path.write_text(svg, encoding="utf-8")
    print(f"wrote {svg_path.relative_to(OUT_DIR.parents[3])}")

    for name, size in PNG_SIZES.items():
        path = OUT_DIR / name
        cairosvg.svg2png(
            url=str(svg_path), write_to=str(path),
            output_width=size, output_height=size,
        )
        print(f"wrote {path.relative_to(OUT_DIR.parents[3])} ({size}×{size})")


if __name__ == "__main__":
    main()
