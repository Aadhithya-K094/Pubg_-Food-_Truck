<#
    Turns the supplied logo.jpeg (a video-player screenshot) into a clean,
    transparent-background PNG logo.

    Steps:
      1. Detect the bright content band, ignoring the black letterbox bars
         and the player UI above/below it.
      2. Knock out the white backdrop to transparency, with soft alpha on
         the edge pixels so the artwork stays anti-aliased.
      3. Crop tight to the remaining artwork.
      4. Save as PNG (logo.png) plus a small favicon-sized variant.
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$src = "d:\pubg app\frontend\src\assets\images\logo.jpeg"
$outDir = "d:\pubg app\frontend\src\assets\images"

Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class LogoProc
{
    // Returns [top, bottom] of the bright horizontal band.
    static int[] FindBand(byte[] px, int w, int h, int stride)
    {
        int top = -1, bottom = -1;
        for (int y = 0; y < h; y++)
        {
            int bright = 0, count = 0;
            for (int x = 0; x < w; x += 4)
            {
                int i = y * stride + x * 4;
                int lum = (px[i + 2] + px[i + 1] + px[i]) / 3;
                if (lum > 170) bright++;
                count++;
            }
            bool isBright = (double)bright / count > 0.5;
            if (isBright) { if (top < 0) top = y; bottom = y; }
        }
        return new int[] { top, bottom };
    }

    public static void Run(string src, string outPng, string outIcon)
    {
        using (Bitmap bmp = new Bitmap(src))
        {
            int w = bmp.Width, h = bmp.Height;
            Bitmap rgba = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(rgba)) g.DrawImage(bmp, 0, 0, w, h);

            BitmapData bd = rgba.LockBits(new Rectangle(0, 0, w, h),
                ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int stride = bd.Stride;
            byte[] px = new byte[stride * h];
            Marshal.Copy(bd.Scan0, px, 0, px.Length);

            int[] band = FindBand(px, w, h, stride);
            int bTop = band[0] < 0 ? 0 : band[0];
            int bBot = band[1] < 0 ? h - 1 : band[1];
            Console.WriteLine("  bright band rows: " + bTop + " -> " + bBot);

            // White -> transparent, only inside the band. Everything outside
            // the band (letterbox + player UI) is discarded entirely.
            int minX = w, minY = h, maxX = -1, maxY = -1;
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int i = y * stride + x * 4;
                    if (y < bTop || y > bBot) { px[i + 3] = 0; continue; }

                    int b = px[i], gg = px[i + 1], r = px[i + 2];
                    int lum = (r + gg + b) / 3;
                    int min = Math.Min(r, Math.Min(gg, b));

                    // near-white == high luminance AND low saturation
                    if (lum >= 232 && min >= 210) { px[i + 3] = 0; }
                    else if (lum >= 200 && min >= 175)
                    {
                        double t = (lum - 200) / 32.0;          // 0..1
                        px[i + 3] = (byte)(255 * (1.0 - t));
                    }

                    if (px[i + 3] > 12)
                    {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            Marshal.Copy(px, 0, bd.Scan0, px.Length);
            rgba.UnlockBits(bd);

            if (maxX < 0) throw new Exception("no opaque content found");
            int pad = 6;
            minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad);
            maxX = Math.Min(w - 1, maxX + pad); maxY = Math.Min(h - 1, maxY + pad);
            int cw = maxX - minX + 1, ch = maxY - minY + 1;
            Console.WriteLine("  cropped to: " + cw + "x" + ch);

            using (Bitmap crop = new Bitmap(cw, ch, PixelFormat.Format32bppArgb))
            {
                using (Graphics g2 = Graphics.FromImage(crop))
                {
                    g2.Clear(Color.Transparent);
                    g2.DrawImage(rgba, new Rectangle(0, 0, cw, ch),
                                 new Rectangle(minX, minY, cw, ch), GraphicsUnit.Pixel);
                }
                crop.Save(outPng, ImageFormat.Png);

                // square icon version, artwork centred on transparent canvas
                int side = Math.Max(cw, ch);
                using (Bitmap sq = new Bitmap(512, 512, PixelFormat.Format32bppArgb))
                {
                    using (Graphics g3 = Graphics.FromImage(sq))
                    {
                        g3.Clear(Color.Transparent);
                        g3.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        double scale = 512.0 / side * 0.94;
                        int dw = (int)(cw * scale), dh = (int)(ch * scale);
                        g3.DrawImage(crop, (512 - dw) / 2, (512 - dh) / 2, dw, dh);
                    }
                    sq.Save(outIcon, ImageFormat.Png);
                }
            }
            rgba.Dispose();
        }
    }
}
"@ -ReferencedAssemblies System.Drawing

$outPng = Join-Path $outDir "logo.png"
$outIcon = Join-Path $outDir "logo-square.png"

Write-Host "Processing logo..." -ForegroundColor Cyan
[LogoProc]::Run($src, $outPng, $outIcon)

foreach ($f in @($outPng, $outIcon)) {
    $i = Get-Item $f
    Write-Host ("  {0,8:N1} KB  {1}" -f ($i.Length / 1KB), $i.Name) -ForegroundColor Green
}
Write-Host "Done." -ForegroundColor Cyan
