/*
 * Copyright 2010-2019 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or 
 *   modify it under the terms of the GNU Affero General Public License 
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 * 
 *   The code in this file is distributed in the hope that it will be useful, 
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero 
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may 
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU 
 *   AGPL normally required by section 4, provided you include this license 
 *   notice and a URL through which recipients can access the Corresponding 
 *   Source.
 */

/* global browser, singlefile, fetch, TextDecoder */

singlefile.extension.core.bg.business = (() => {

	let contentScript, frameScript, modulesScript;

	const contentScriptFiles = [
		"/index.js",
		"/lib/hooks/content/content-hooks.js",
		"/lib/browser-polyfill/chrome-browser-polyfill.js",
		"/lib/single-file/vendor/css-tree.js",
		"/lib/single-file/vendor/html-srcset-parser.js",
		"/lib/single-file/single-file-util.js",
		"/lib/single-file/single-file-helper.js",
		"/lib/fetch/content/content-fetch-resources.js",
		"/lib/single-file/single-file-core.js",
		"/lib/single-file/single-file.js",
		"/extension/ui/content/content-ui-main.js",
		"/extension/core/content/content-main.js"
	];

	const frameScriptFiles = [
		"/index.js",
		"/lib/hooks/content/content-hooks-frames.js",
		"/lib/browser-polyfill/chrome-browser-polyfill.js",
		"/lib/single-file/single-file-helper.js",
		"/lib/fetch/content/content-fetch-resources.js",
		"/lib/frame-tree/content/content-frame-tree.js"
	];

	const modulesScriptFiles = [
		"/lib/single-file/modules/html-minifier.js",
		"/lib/single-file/modules/html-serializer.js",
		"/lib/single-file/vendor/css-minifier.js",
		"/lib/lazy/content/content-lazy-loader.js",
		"/lib/single-file/modules/html-images-alt-minifier.js",
		"/lib/single-file/vendor/css-font-property-parser.js",
		"/lib/single-file/modules/css-fonts-minifier.js",
		"/lib/single-file/modules/css-fonts-alt-minifier.js",
		"/lib/single-file/modules/css-matched-rules.js",
		"/lib/single-file/modules/css-rules-minifier.js",
		"/lib/single-file/vendor/css-media-query-parser.js",
		"/lib/single-file/modules/css-medias-alt-minifier.js"
	];

	initScripts();

	return { saveTab };

	async function saveTab(tab, options = {}) {
		const config = singlefile.extension.core.bg.config;
		const autosave = singlefile.extension.core.bg.autosave;
		const tabs = singlefile.extension.core.bg.tabs;
		const ui = singlefile.extension.ui.bg.main;
		if (singlefile.extension.core.bg.util.isAllowedURL(tab.url)) {
			await initScripts();
			const tabId = tab.id;
			options.tabId = tabId;
			options.tabIndex = tab.index;
			try {
				if (options.autoSave) {
					const options = await config.getOptions(tab.url, true);
					if (autosave.isEnabled(tab)) {
						await tabs.sendMessage(tabId, { method: "content.autosave", options });
					}
				} else {
					ui.onInitialize(tabId, options, 1);
					const mergedOptions = await config.getOptions(tab.url);
					Object.keys(options).forEach(key => mergedOptions[key] = options[key]);
					let scriptsInjected;
					if (!mergedOptions.removeFrames) {
						try {
							await tabs.executeScript(tabId, { code: frameScript, allFrames: true, matchAboutBlank: true, runAt: "document_start" });
						} catch (error) {
							// ignored
						}
					}
					try {
						await initScripts();
						await tabs.executeScript(tabId, { code: modulesScript + "\n" + contentScript, allFrames: false, runAt: "document_idle" });
						scriptsInjected = true;
					} catch (error) {
						// ignored
					}
					if (scriptsInjected) {
						ui.onInitialize(tabId, options, 2);
						if (mergedOptions.frameId) {
							await tabs.executeScript(tabId, { code: "document.documentElement.dataset.requestedFrameId = true", frameId: mergedOptions.frameId, matchAboutBlank: true, runAt: "document_start" });
						}
						await tabs.sendMessage(tabId, { method: "content.save", options: mergedOptions });
					} else {
						ui.onForbiddenDomain(tab, options);
					}
				}
			} catch (error) {
				console.log(error); // eslint-disable-line no-console
				ui.onError(tabId, options);
			}
		}
	}

	async function initScripts() {
		if (!contentScript && !frameScript && !modulesScript) {
			[contentScript, frameScript, modulesScript] = await Promise.all([
				getScript(contentScriptFiles),
				getScript(frameScriptFiles),
				getScript(modulesScriptFiles)
			]);
		}
	}

	async function getScript(scriptFiles) {
		const scriptsPromises = scriptFiles.map(async scriptFile => {
			if (typeof scriptFile == "function") {
				return "(" + scriptFile.toString() + ")();";
			} else {
				const scriptResource = await fetch(browser.runtime.getURL(scriptFile));
				return new TextDecoder().decode(await scriptResource.arrayBuffer());
			}
		});
		let content = "";
		for (const scriptPromise of scriptsPromises) {
			content += await scriptPromise;
		}
		return content;
	}

})();