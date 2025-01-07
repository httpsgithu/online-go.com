/*
 * Copyright (C)  Online-Go.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Plugin, defineConfig, ResolvedConfig, ViteDevServer, ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import fixReactVirtualized from "esbuild-plugin-react-virtualized";
import path from "path";
import { promises as fs } from "fs";
import { IncomingMessage } from "http";
import http from "http";
import checker from "vite-plugin-checker";
import atImport from "postcss-import";
import inline_svg from "postcss-inline-svg";
import autoprefixer from "autoprefixer";

let OGS_BACKEND = process.env.OGS_BACKEND || "BETA";
OGS_BACKEND = OGS_BACKEND.toUpperCase();
//OGS_BACKEND = "BETA";
//OGS_BACKEND = "PRODUCTION";
//OGS_BACKEND = "LOCAL";

const backend_url =
    OGS_BACKEND === "BETA"
        ? "https://beta.online-go.com"
        : OGS_BACKEND === "PRODUCTION"
          ? "https://online-go.com"
          : //: "http://localhost:1080"; // local
            "http://127.0.0.1:1080"; // local

const proxy: Record<string, ProxyOptions> = {};

// REST api proxies
for (const base_path of [
    "/api",
    "/termination-api",
    "/merchant",
    "/billing",
    "/sso",
    "/oauth2",
    "/complete",
    "/disconnect",
    "/OGSScoreEstimator",
    "/oje",
    "/firewall",
    "/__debug__",
]) {
    proxy[base_path] = {
        target: backend_url,
        changeOrigin: true,
        rewrite: (path: string) => {
            return backend_url + path;
        },
    };
}

// termination-server websocket proxy
proxy["^/$"] = {
    target: backend_url + "/",
    changeOrigin: true,
    ws: true,
    rewriteWsOrigin: true,
    rewrite: (path: string) => {
        //console.info("termination-server websocket -> ", backend_url + "/");
        return backend_url + path;
    },
    bypass: (req, res, _options) => {
        if (res) {
            // res is undefined for websockets, which is the only thing we want
            // to proxy. For other requests, namely serving index.html, we want
            // vite to handle it, so returning the url here does that.
            return req.url;
        }
        return undefined;
    },
};

export default defineConfig({
    root: "src",
    build: {
        outDir: "../dist",
        sourcemap: true,
        minify: "terser",
        lib: {
            name: "ogs",
            entry: "main.tsx",
            formats: ["iife"],
            fileName: (_format, _entryName) => {
                return `ogs.js`;
            },
        },
        rollupOptions: {
            output: {
                assetFileNames: "ogs.[ext]",
            },
        },
    },
    css: {
        postcss: {
            plugins: [atImport(), inline_svg(), autoprefixer()],
        },
        preprocessorMaxWorkers: true,
        devSourcemap: true,
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
    plugins: [
        ogs_vite_middleware(),
        react(),
        // checker relative directory is src/
        checker({
            typescript: {
                tsconfigPath:
                    process.env.NODE_ENV === "production" ? "tsconfig.json" : "../tsconfig.json",
            },
            eslint: {
                useFlatConfig: true,
                lintCommand: "eslint .",
            },
            overlay: {
                initialIsOpen: true,
            },
            enableBuild: true,
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    optimizeDeps: {
        esbuildOptions: {
            plugins: [fixReactVirtualized],
        },
    },
    server: {
        port: 8080,
        host: true,
        proxy,
        hmr: {
            path: "/__vite_hmr",
            overlay: true,
        },
    },
});

/*
 * For historical reasons, OGS uses a custom index.html template system
 */
function ogs_vite_middleware(): Plugin {
    let config: ResolvedConfig;
    //let command: "build" | "serve" = "build";
    return {
        name: "ogs-process-index-template",
        /*
        config(_config, env) {
            command = env.command;
        },
        */
        configResolved(resolvedConfig) {
            config = resolvedConfig;
        },

        /**
         * for dev
         * if SPA, just use template and write script main.{js,ts} for /{entry}.html
         * if MPA, check pageName(default is index) and write /${pagesDir}/{pageName}/${entry}.html
         */
        configureServer(server: ViteDevServer) {
            return () => {
                /* Handle our custom index template, serve it for anything that doesn't look like a file */
                server.middlewares.use(async (req, res, next) => {
                    const url = req.originalUrl || "";
                    // if not html, next it.
                    const should_serve_index =
                        url.endsWith(".html") || url === "/" || /^.*\/[^.]*$/.test(url);
                    if (!should_serve_index) {
                        return next();
                    }

                    let content = await fs.readFile(
                        path.resolve(config.root, "index.html"),
                        "utf-8",
                    );

                    content = await ogs_process_template(content, req);

                    // using vite's transform html function to add basic html support
                    //content = await server.transformIndexHtml?.(req.url, content, req.originalUrl);
                    content = await server.transformIndexHtml?.(url, content, req.originalUrl);

                    res.end(content);
                });

                /* Handle some non vite static files */
                server.middlewares.use(async (req, res, next) => {
                    const url = req.originalUrl;

                    function send_response(
                        body: string,
                        content_type: string = "application/javascript",
                    ) {
                        res.setHeader("Content-Type", `${content_type}; charset=utf-8`);
                        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                        res.setHeader("Pragma", "no-cache");
                        res.setHeader("Expires", "0");
                        res.setHeader("Content-Length", Buffer.byteLength(body));
                        res.statusCode = 200;
                        res.end(body);
                        return;
                    }

                    if (url === "/goban.js") {
                        console.info(`GET ${url} -> node_modules/goban/build/goban.js`);
                        send_response(
                            await fs.readFile("node_modules/goban/build/goban.js", {
                                encoding: "utf-8",
                            }),
                        );
                        return;
                    }
                    if (url === "/goban.js.map") {
                        console.info(`GET ${url} -> node_modules/goban/build/goban.js.map`);
                        send_response(
                            await fs.readFile("node_modules/goban/build/goban.js.map", {
                                encoding: "utf-8",
                            }),
                        );
                        return;
                    }
                    if (url === "/manifest.json") {
                        const manifest = {
                            short_name: "OGS",
                            name: "Online-Go.com",
                            icons: [
                                {
                                    src: "https://cdn.online-go.com/icons/android-chrome-192x192.png",
                                    type: "image/png",
                                    sizes: "192x192",
                                },
                            ],
                            start_url: "/",
                            display: "standalone",
                            scope: "/",
                            background_color: "#eeeeee",
                            theme_color: "#000000",
                        };
                        send_response(JSON.stringify(manifest), "application/json");

                        return;
                    }
                    if (url?.endsWith("ogs.css")) {
                        // blank, vite deals with css stuff until production
                        send_response("", "text/css");
                        return;
                    }

                    if (url?.endsWith("vendor.js")) {
                        console.info(`GET ${url} -> node_modules/vendor.js`);
                        send_response("");
                        return;
                    }

                    if (url?.startsWith("/locale")) {
                        /*
                        console.info(
                            `GET ${url} -> http://storage.googleapis.com/ogs-site-files/dev${url}`,
                        );
                        */

                        const options = {
                            hostname: "storage.googleapis.com",
                            port: 80,
                            path: "/ogs-site-files/dev" + url,
                            method: "GET",
                        };

                        const outgoing_request = http.request(options, (outgoing_response) => {
                            outgoing_response.setEncoding("utf8");
                            let data = "";
                            outgoing_response.on("data", (chunk) => {
                                data += chunk.toString();
                            });
                            outgoing_response.on("end", () => {
                                send_response(data);
                            });
                        });

                        outgoing_request.on("error", (e) => {
                            res.statusCode = 500;
                            res.end(e.message);
                        });

                        outgoing_request.end();
                        return;
                    }

                    return next();
                });
            };
        },
    };
}

async function ogs_process_template(content: string, req: IncomingMessage): Promise<string> {
    const use_local_goban = (await fs.lstat("node_modules/goban")).isSymbolicLink();
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const port = url.port;

    const supported_languages = JSON.parse(
        await fs.readFile("i18n/languages.json", { encoding: "utf-8" }),
    );

    const package_json = JSON.parse(await fs.readFile("package.json", { encoding: "utf-8" }));

    const replaced = content.replace(/[{][{]\s*(\w+)\s*[}][}]/g, (_, parameter) => {
        switch (parameter) {
            case "CDN_SERVICE": {
                // We run within a docker container on 8080 but are served out of 443 so no
                // need to specify a port, just use the same hostname.
                if (url.hostname?.indexOf("uffizzi") >= 0) {
                    return `//${url.hostname}/`;
                }
                return `//${url.hostname}:${port}/`;
            }
            case "LIVE_RELOAD": {
                if (url.hostname?.indexOf("uffizzi") >= 0) {
                    // no need for live reloading on uffizzi
                    return ``;
                }
                //return `<script async src="//${url.hostname}:35701/livereload.js"></script>`;
                return ``;
            }
            case "MIN":
                return "";

            case "PAGE_TITLE":
                return "Play Go at online-go.com!";
            case "PAGE_DESCRIPTION":
                return "Online-Go.com is the best place to play the game of Go online. Our community supported site is friendly, easy to use, and free, so come join us and play some Go!";
            case "PAGE_KEYWORDS":
                return "Go, Baduk, Weiqi, OGS, Online-Go.com";
            case "PAGE_LANGUAGE":
                return getPreferredLanguage(req, supported_languages);

            case "OG_TITLE":
                return "";
            case "OG_URL":
                return "";
            case "OG_IMAGE":
                return "";
            case "OG_DESCRIPTION":
                return "";
            case "SUPPORTED_LANGUAGES":
                return JSON.stringify(supported_languages);

            case "AMEX_CLIENT_ID":
                /* cspell: disable-next-line */
                return "kvEB9qXE6jpNUv3fPkdbWcPaZ7nQAXyg";
            case "AMEX_ENV":
                return "qa";

            case "RELEASE":
                return "";
            case "VERSION":
                return "";
            case "LANGUAGE_VERSION":
                return "";
            case "VENDOR_HASH_DOTJS":
                return "js";
            case "VERSION_DOTJS":
                //return "js";
                return "";
            case "OGS_VERSION_HASH_DOTJS":
                return "js";
            case "VERSION_DOTCSS":
                return "css";
            case "LANGUAGE_VERSION_DOTJS":
                return "js";
            case "GOBAN_JS": {
                if (use_local_goban) {
                    return `/goban.js`;
                } else {
                    return `https://cdn.online-go.com/goban/${package_json.devDependencies.goban.substr(
                        1,
                    )}/goban.js`;
                }
            }
            case "EXTRA_CONFIG":
                //return `<script>window['websocket_host'] = "${server_url}";</script>`;
                return ``;
        }
        return "{{" + parameter + "}}";
    });
    return replaced;
}

/* Detect preferred language  */
function isSupportedLanguage(lang: string, supported_languages: any) {
    if (!lang) {
        return null;
    }

    lang = lang.toLowerCase();

    if (lang in supported_languages) {
        return lang;
    }

    lang = lang.replace(/-[a-z]+/, "");

    if (lang in supported_languages) {
        return lang;
    }

    return null;
}

function getPreferredLanguage(req: IncomingMessage, supported_languages: any) {
    let languages = ["en"];
    try {
        languages = (req.headers?.["accept-language"] || "")
            .split(",")
            .map((s) => s.replace(/;q=.*/, "").trim().toLowerCase());
    } catch (e) {
        console.trace(e);
    }

    try {
        for (let i = 0; i < languages.length; ++i) {
            const lang = isSupportedLanguage(languages[i], supported_languages);
            if (lang) {
                return lang;
            }
        }
    } catch (e) {
        console.trace(e);
    }

    return "en";
}
