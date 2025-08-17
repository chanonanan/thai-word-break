# Thai Word Breaker (EPUB)

A browser-based tool for inserting Thai word breaks into EPUB files. Supports ZWSP and `<wbr>` insertion, dictionary and cache settings, and in-browser preview for various e-reader devices.

## Features
- Drag-and-drop EPUB processing
- Thai word segmentation using dictionary
- Insert ZWSP or `<wbr>` for word breaks
- Dictionary URL and cache control
- Local dictionary override
- Preview processed files in-browser
- Device preview for popular e-readers (Kindle, Kobo, iPad, etc.)
- Font size and text alignment controls
- Show/hide word break markers
- Compare original and processed HTML
- Pause/Continue processing for large files
- All preview settings saved to localStorage

## Usage
1. Open `index.html` in your browser.
2. Drop an EPUB file or select one using the file input.
3. Adjust settings as needed (word break mode, dictionary, cache, etc.).
4. Click **Process EPUB** to start processing. You can pause/continue if needed.
5. Preview processed files, change device, font, alignment, and compare with original HTML.
6. Download the processed EPUB when ready.

## Device Preview
Choose from a list of popular e-reader devices to simulate screen size in the preview pane. Font size and text alignment can also be adjusted.

## Development
- All code is client-side JavaScript and HTML/CSS.
- No server required; everything runs in the browser.
- Uses [JSZip](https://stuk.github.io/jszip/) and [FileSaver.js](https://github.com/eligrey/FileSaver.js/) via CDN.

## License
MIT
