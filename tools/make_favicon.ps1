<#
    Build favicon files from the cleaned crest logo (logo.png).

    Produces, in frontend/public:
      favicon.ico   (16 + 32 + 48 px, what the browser tab uses)
      favicon.png   (32 px)
      logo192.png   (192 px, PWA / apple-touch)
      logo512.png   (512 px, PWA)

    The transparent logo is composited onto the dark theme colour so the
    dark-red crest stays visible on a light browser tab strip.
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$src = "d:\pubg app\frontend\src\assets\images\logo.png"
$pub = "d:\pubg app\frontend\public"

Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class Fav
{
    // Render the source logo centred on a rounded dark tile of the given size.
    public static Bitmap Tile(string src, int size)
    {
        using (Bitmap logo = new Bitmap(src))
        {
            Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.Clear(Color.Transparent);

                // rounded dark background tile (theme charcoal)
                int r = Math.Max(2, size / 6);
                using (var path = new System.Drawing.Drawing2D.GraphicsPath())
                {
                    path.AddArc(0, 0, r, r, 180, 90);
                    path.AddArc(size - r, 0, r, r, 270, 90);
                    path.AddArc(size - r, size - r, r, r, 0, 90);
                    path.AddArc(0, size - r, r, r, 90, 90);
                    path.CloseFigure();
                    using (var brush = new SolidBrush(Color.FromArgb(255, 30, 35, 43)))
                        g.FillPath(brush, path);
                }

                // fit the logo with a small margin
                double margin = size * 0.10;
                double avail = size - margin * 2;
                double scale = Math.Min(avail / logo.Width, avail / logo.Height);
                int w = (int)(logo.Width * scale);
                int h = (int)(logo.Height * scale);
                g.DrawImage(logo, (size - w) / 2, (size - h) / 2, w, h);
            }
            return bmp;
        }
    }

    public static void SavePng(string src, int size, string outPath)
    {
        using (Bitmap b = Tile(src, size)) b.Save(outPath, ImageFormat.Png);
    }

    // Build a multi-resolution .ico from 16/32/48 PNG frames.
    public static void SaveIco(string src, string outPath)
    {
        int[] sizes = { 16, 32, 48 };
        byte[][] pngs = new byte[sizes.Length][];
        for (int i = 0; i < sizes.Length; i++)
        {
            using (Bitmap b = Tile(src, sizes[i]))
            using (MemoryStream ms = new MemoryStream())
            {
                b.Save(ms, ImageFormat.Png);
                pngs[i] = ms.ToArray();
            }
        }

        using (FileStream fs = new FileStream(outPath, FileMode.Create))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            bw.Write((short)0);            // reserved
            bw.Write((short)1);            // type: icon
            bw.Write((short)sizes.Length); // image count

            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++)
            {
                bw.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i])); // width
                bw.Write((byte)(sizes[i] >= 256 ? 0 : sizes[i])); // height
                bw.Write((byte)0);   // palette
                bw.Write((byte)0);   // reserved
                bw.Write((short)1);  // colour planes
                bw.Write((short)32); // bpp
                bw.Write(pngs[i].Length);
                bw.Write(offset);
                offset += pngs[i].Length;
            }
            foreach (var p in pngs) bw.Write(p);
        }
    }
}
"@ -ReferencedAssemblies System.Drawing

[Fav]::SaveIco($src, (Join-Path $pub "favicon.ico"))
[Fav]::SavePng($src, 32,  (Join-Path $pub "favicon.png"))
[Fav]::SavePng($src, 192, (Join-Path $pub "logo192.png"))
[Fav]::SavePng($src, 512, (Join-Path $pub "logo512.png"))

foreach ($f in @("favicon.ico","favicon.png","logo192.png","logo512.png")) {
    $p = Join-Path $pub $f
    Write-Host ("  {0,8:N1} KB  {1}" -f ((Get-Item $p).Length / 1KB), $f)
}
Write-Host "Done."
