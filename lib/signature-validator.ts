/**
 * Signature & Seal Transparent Image Validator
 *
 * Validates that an uploaded image:
 * 1. Is a valid PNG file (no JPG, PDF, WEBP, etc.)
 * 2. Has an authentic transparent background with no solid/opaque background color
 * 3. Has transparent corners and boundary margins typical of transparent signatures and seals
 */

export interface SignatureValidationResult {
  valid: boolean
  error?: string
  dataUrl?: string
}

export const TRANSPARENT_BG_ERROR_MESSAGE =
  'Please upload a signature or seal image with a transparent background. Images with any background color are not allowed.'

export async function validateTransparentSignatureSeal(
  file: File
): Promise<SignatureValidationResult> {
  // 1. Strict format check: ONLY PNG files are accepted
  const isPng =
    file.type === 'image/png' ||
    file.name.toLowerCase().endsWith('.png')

  if (!isPng) {
    return {
      valid: false,
      error: TRANSPARENT_BG_ERROR_MESSAGE,
    }
  }

  // File size safeguard (Max 15MB)
  if (file.size > 15 * 1024 * 1024) {
    return {
      valid: false,
      error: 'File size exceeds 15MB limit. Please upload a compressed PNG image.',
    }
  }

  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onerror = () => {
      resolve({
        valid: false,
        error: 'Unable to read the image file. Please try again.',
      })
    }

    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()

      img.onerror = () => {
        resolve({
          valid: false,
          error: TRANSPARENT_BG_ERROR_MESSAGE,
        })
      }

      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width
          const h = img.naturalHeight || img.height

          if (!w || !h || w <= 0 || h <= 0) {
            resolve({
              valid: false,
              error: TRANSPARENT_BG_ERROR_MESSAGE,
            })
            return
          }

          // Scale down canvas for performance analysis while keeping sufficient resolution
          const maxDim = 600
          let canvasW = w
          let canvasH = h
          if (canvasW > maxDim || canvasH > maxDim) {
            if (canvasW > canvasH) {
              canvasH = Math.max(1, Math.round((canvasH * maxDim) / canvasW))
              canvasW = maxDim
            } else {
              canvasW = Math.max(1, Math.round((canvasW * maxDim) / canvasH))
              canvasH = maxDim
            }
          }

          const canvas = document.createElement('canvas')
          canvas.width = canvasW
          canvas.height = canvasH
          const ctx = canvas.getContext('2d', { willReadFrequently: true })

          if (!ctx) {
            // If canvas context unavailable in rare browser scenario, accept dataUrl
            resolve({ valid: true, dataUrl })
            return
          }

          ctx.drawImage(img, 0, 0, canvasW, canvasH)
          const imgData = ctx.getImageData(0, 0, canvasW, canvasH)
          const pixels = imgData.data
          const totalPixels = canvasW * canvasH

          // 1. Transparent pixel ratio check:
          // A genuine signature or seal has transparent background around the strokes/stamp.
          // Pixels with alpha <= 35 are considered transparent.
          let transparentPixels = 0
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] <= 35) {
              transparentPixels++
            }
          }

          const transparentRatio = transparentPixels / totalPixels

          // If the image has virtually zero transparent pixels (< 4%), it is solid/opaque (e.g. white scan, colored background)
          if (transparentRatio < 0.04) {
            resolve({
              valid: false,
              error: TRANSPARENT_BG_ERROR_MESSAGE,
            })
            return
          }

          // 2. Corner transparency check:
          // In a transparent signature/seal, the corners (0,0), (w-1,0), (0,h-1), (w-1,h-1)
          // must be transparent background, NOT filled with solid background color (e.g. white 255,255,255 or colored)
          const cornerCoords = [
            [0, 0],
            [canvasW - 1, 0],
            [0, canvasH - 1],
            [canvasW - 1, canvasH - 1],
          ]

          let opaqueCorners = 0
          for (const [cx, cy] of cornerCoords) {
            const idx = (cy * canvasW + cx) * 4
            const alpha = pixels[idx + 3]
            if (alpha > 45) {
              opaqueCorners++
            }
          }

          // If 3 or 4 corners are opaque, the image has a full background color instead of transparency
          if (opaqueCorners >= 3) {
            resolve({
              valid: false,
              error: TRANSPARENT_BG_ERROR_MESSAGE,
            })
            return
          }

          // 3. Perimeter border check:
          // Sample along the 4 outer perimeter edges.
          // If > 55% of border pixels are opaque, the background is a solid color.
          let perimeterSamples = 0
          let opaqueBorderSamples = 0

          // Top and Bottom edges
          const stepX = Math.max(1, Math.floor(canvasW / 40))
          for (let x = 0; x < canvasW; x += stepX) {
            const topAlpha = pixels[x * 4 + 3]
            const btmAlpha = pixels[((canvasH - 1) * canvasW + x) * 4 + 3]
            perimeterSamples += 2
            if (topAlpha > 45) opaqueBorderSamples++
            if (btmAlpha > 45) opaqueBorderSamples++
          }

          // Left and Right edges
          const stepY = Math.max(1, Math.floor(canvasH / 40))
          for (let y = 0; y < canvasH; y += stepY) {
            const leftAlpha = pixels[(y * canvasW) * 4 + 3]
            const rightAlpha = pixels[(y * canvasW + (canvasW - 1)) * 4 + 3]
            perimeterSamples += 2
            if (leftAlpha > 45) opaqueBorderSamples++
            if (rightAlpha > 45) opaqueBorderSamples++
          }

          if (perimeterSamples > 0 && opaqueBorderSamples / perimeterSamples > 0.55) {
            resolve({
              valid: false,
              error: TRANSPARENT_BG_ERROR_MESSAGE,
            })
            return
          }

          // All transparency and background validations passed!
          resolve({
            valid: true,
            dataUrl,
          })
        } catch (e) {
          console.error('Signature transparency validation error:', e)
          resolve({
            valid: false,
            error: TRANSPARENT_BG_ERROR_MESSAGE,
          })
        }
      }

      img.src = dataUrl
    }

    reader.readAsDataURL(file)
  })
}
