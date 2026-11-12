# OnePress

OnePress turns photos of printed English notices into editable text and reads that text aloud. It gives readers a chance to check important details, such as a date or room number, before listening.

**[Open the live demo](https://onepress-notice-reader.vercel.app/)**

## Try it

1. Choose **Try a sample notice** or upload a JPG or PNG from your device.
2. Review the extracted text beside the image. Use the image adjustments and re-scan if needed.
3. Correct any mistakes, then select **Read aloud**. You can choose an available English voice, adjust the speed and pitch, and follow the highlighted sentence.
4. Save the notice to reopen it in the same browser, or export the corrected text.

## How it works

OnePress is a React and Vite app served as a static site. Tesseract.js runs OCR in a browser worker using a bundled English model. The app stores saved notices in IndexedDB and uses the browser's Speech Synthesis API for narration.

Uploaded images are processed in the browser. Saved notices belong to the browser and site address where you created them. Available voices and audio playback depend on your device and browser.

## Run locally

Use Node.js 22.12+ and npm. From the repository root, run:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Testing

The production build passed 26 Playwright checks in Chromium, including the actual file chooser, OCR, saving and reopening a corrected notice after reload, text exports, keyboard navigation, and a narrow mobile layout. Speech tests used a controlled substitute for the browser speech API to verify the controls and the text passed for narration. Audible playback can be checked in a browser with an English voice.

To run the technical OCR check and browser suite, start the production preview in one terminal:

```bash
npm run test:ocr
npm run build
npx playwright install chromium
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

In another terminal, run `npm run test:e2e`. To run just the file upload checks, use `npm run test:upload`.

### OCR benchmark

The [evaluation page](https://onepress-notice-reader.vercel.app/#evaluation) compares the extracted date, time, and room against the printed values on three fictional campus notices. These results measure the three fixtures before manual correction.

| Notice | Fields matched |
| --- | ---: |
| Clear | 3/3 |
| Low contrast | 3/3 |
| Blurry | 0/3 |
| **Total** | **6/9** |

On the blurry notice, OCR missed the date, time, and room. The reader flags low-confidence words and advises the user to check the image.
