<p align="center">
  <img src="src/icons/icon128.png" alt="Zuri logo" width="80" height="80">
</p>
<h1 align="center">Zuri</h1>

Zuri is an open-source browser agent that runs as a Chrome extension. Describe a task in one
sentence, and it works in the sites you are already signed in to, extracts data, and returns tables,
files, or reports with sources. It works with the model provider you choose, using your own API key.
Task data stays in your browser and is sent only to that provider.

## Install

Install Node.js 24 LTS and npm, then build the extension from the repository root:

```bash
npm ci
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `dist/extension/`.
3. Click the Zuri icon in the toolbar to open the side panel.
4. Open **Settings**, choose a model provider, enter its API key, and save.

After you change the source, run `npm run build` again and reload the extension on
`chrome://extensions`.

## License

Apache-2.0. See [LICENSE](LICENSE).

Forked from [alibaba/qz-browser-agent](https://github.com/alibaba/qz-browser-agent).
