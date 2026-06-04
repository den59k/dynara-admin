import type { BunPlugin } from 'bun';
import * as compiler from '@vue/compiler-sfc';
import * as fs from 'node:fs';

interface VuePluginOptions {
  prodDevTools?: boolean;
  optionsApi?: boolean;
  prodHydrationMismatchDetails?: boolean;
  inlineStyles?: boolean
}

// NOTE: Does not work in Bun's dev server yet, since
// the dev server does not actually respect config mutation.
function setVueCompileTimeFlags(build: Bun.PluginBuilder, options: VuePluginOptions) {
  build.config.define ??= {}
  build.config.define['__VUE_PROD_DEVTOOLS__'] = options.prodDevTools === false ? 'false' : 'true';
  build.config.define['__VUE_OPTIONS_API__'] = options.optionsApi === false ? 'false' : 'true';
  build.config.define['__VUE_PROD_HYDRATION_MISMATCH_DETAILS__'] = options.prodHydrationMismatchDetails === false ? 'false' : 'true';
}


function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

try {
  const ts = await import('typescript');
  compiler.registerTS(() => ts);
} catch {}

// Добавить сразу после:
let sass: typeof import('sass') | undefined;
try {
  sass = await import('sass');
} catch {}

function plugin(options?: VuePluginOptions): BunPlugin {
  const opts = options || {};

  // Set default options
  Object.assign(opts, {
    prodDevTools: opts.prodDevTools ?? false,
    optionsApi: opts.optionsApi ?? false,
    prodHydrationMismatchDetails: opts.prodHydrationMismatchDetails ?? false,
  })

  return {
    name: 'vue',
    setup(build) {
      if (Bun.env.NODE_ENV !== 'production') {
        setVueCompileTimeFlags(build, opts);
      }

      build.onResolve({ filter: /\.vue/ }, (args) => {
        const paramsString = args.path.split('?')[1];
        const params = new URLSearchParams(paramsString);
        const type = params.get('type');

        const ns = type === 'script'
          ? 'sfc-script'
          : type === 'template'
          ? 'sfc-template'
          : type === 'style'
          ? 'sfc-style'
          : undefined;

        if (ns === undefined) {
          return
        }

        return {
          path: normalizePath(args.path),
          namespace: ns,
        }
      });

      let currentId = 0;

      const idMap = new Map<string, string>();
      const descriptorMap = new Map<string, compiler.SFCDescriptor>();
      const scriptBindingMap = new Map<string, compiler.BindingMetadata>();

      build.onLoad({ filter: /.*/, namespace: 'sfc-template' }, async (args) => {
        const path = normalizePath(args.path.split('?')[0]!);
        const descriptor = descriptorMap.get(path);

        if (!descriptor) {
          throw new Error(
            `[vue-plugin:error] Template compilation descriptor not found for ${path}`
          );
        }

        const id = idMap.get(path)!;
        // const script = scriptMap.get(path)!;
        const bindingMetadata = scriptBindingMap.get(path)!
        const lang = "ts"

        const template = compiler.compileTemplate({
          id,
          scoped: descriptor.styles.some((s) => s.scoped),
          source: descriptor.template!.content,
          filename: args.path,
          compilerOptions: {
            hmr: true,
            bindingMetadata,
            // Enable TypeScript support in templates
            expressionPlugins: lang === 'ts' ? ['typescript'] : undefined,
          }
        })

        return {
          contents: template.code,
          loader: 'ts',
        }
      });

      const getContent = (style: compiler.SFCStyleBlock) => {
        if (style.lang === "sass" && sass) {
          const result = sass.compileString(style.content, { syntax: "indented" });
          return result.css.toString();
        } else {
          return style.content;
        }
      }

      if (options?.inlineStyles) {
        build.onLoad({ filter: /.*/, namespace: 'sfc-style' }, async (args) => {
          const path = normalizePath(args.path.split('?')[0]!);
          const descriptor = descriptorMap.get(path)!;
          const id = idMap.get(path)!;
          // ... существующая компиляция через compiler.compileStyle ...
          const style = compiler.compileStyle({
            id,
            scoped: descriptor.styles.some((s) => s.scoped),
            source: descriptor.styles.map((s) => getContent(s)).join('\n'),
            filename: args.path,
            preprocessLang: "sass"
          })

          // было: return { contents: style.code, loader: 'css' }
          // стало: отдаём JS, который сам инжектит CSS
          return {
            contents: `
              const css = ${JSON.stringify(style.code)};
              const tag = document.createElement("style");
              tag.setAttribute("data-v-style", ${JSON.stringify(id)});
              tag.textContent = css;
              document.head.appendChild(tag);
            `,
            loader: 'js',
          }
        })
      } else {
        build.onLoad({ filter: /.*/, namespace: 'sfc-style' }, async (args) => {
          const path = normalizePath(args.path.split('?')[0]!);
          const descriptor = descriptorMap.get(path);
          const id = idMap.get(path)!;
  
          if (!descriptor) {
            throw new Error(
              `[vue-plugin:error] Style compilation descriptor not found for ${path}`
            );
          }
  
          const style = compiler.compileStyle({
            id,
            scoped: descriptor.styles.some((s) => s.scoped),
            source: descriptor.styles.map((s) => getContent(s)).join('\n'),
            filename: args.path,
            preprocessLang: "sass"
          })
  
          return {
            contents: style.code,
            loader: 'css',
          }
        });
      }

      function getVueId(path: string) {
        const hash = new Bun.SHA256().update(normalizePath(path)).digest("hex").slice(0, 8);
        return `data-v-${hash}`;
      }

      build.onLoad({ filter: /\.vue$/ }, async (args) => {
        const file = Bun.file(args.path);
        const source = await file.text();

        const { descriptor, errors } = compiler.parse(source, {
          filename: normalizePath(args.path),
          // TODO: sourcemap
        });

        if (errors.length) {
          console.error(
            `[vue-plugin:error] Errors parsing ${args.path}`,
          );
          throw errors[0]!;
        }

        descriptorMap.set(normalizePath(args.path), descriptor);

        const id = getVueId(args.path);
        idMap.set(normalizePath(args.path), id);

        let code = ""
        if (descriptor.script || descriptor.scriptSetup) {
          const logError = <T>(message: string, value: T): T => {
            console.error(`[vue-plugin:error] ${message}`);
            return value;
          };
          const script = compiler.compileScript(descriptor, {
            id,
            genDefaultAs: "script",
            // Provide fs access for type imports in script compilation
            fs: {
              fileExists: fs.existsSync,
              // Prevent error: EISDIR: illegal operation on a directory, read
              readFile: (file: string) => {
                if (fs.lstatSync(file).isDirectory()) {
                  return fs.existsSync(file + '/index.ts') ? fs.readFileSync(file + '/index.ts', 'utf-8') : fs.existsSync(file + '/index.d.ts') ? fs.readFileSync(file + '/index.d.ts', 'utf-8') : logError<string>('Could not resolve directory', '')
                } else {
                  return fs.readFileSync(file, 'utf-8');
                }
              },
            }
          });

          if (script.bindings) {
            scriptBindingMap.set(normalizePath(args.path), script.bindings)
          }

          code = script.content
        } else {
          code = "const script = {};"
        }

        if (descriptor.template) {
          code = `import { render } from "${normalizePath(args.path)}?type=template";\n` + code;
          code += '\nscript.render = render;\n';
        }
        
        if (descriptor.styles.length > 0) {
          code = `import "${normalizePath(args.path)}?type=style";\n` + code;
        }
        
        code += "\nexport default script;\n"

        if (Bun.env.NODE_ENV !== 'production') {
            code += `
          if (import.meta.hot) {
            const __HMR_ID__ = ${JSON.stringify(id)};
            script.__hmrId = __HMR_ID__;

            import.meta.hot.data.isFirstRender ??= true

            __VUE_HMR_RUNTIME__.createRecord(script.__hmrId, script)
            import.meta.hot.accept((mod) => {
              if (import.meta.hot.data.isFirstRender) {
                import.meta.hot.data.isFirstRender = false
                return
              }
              import.meta.hot.data.isFirstRender = true
              const newComp = mod?.default;
              if (!newComp) return;

              const id = ${JSON.stringify(id)};
              const runtime = window.__VUE_HMR_RUNTIME__;

              if (runtime) {
                if (newComp.render) {
                  runtime.reload(id, newComp)
                  // runtime.rerender(id, newComp.render);
                } else {
                  runtime.reload(id, newComp);
                }
              } else {
                console.warn('[vue-hmr] No Vue HMR runtime found.');
              }
            });
          }

          `;
        }

        return {
          contents: code,
          loader: "ts"
        }
      });

      const replacedMap = new Map<string, string>();

      build.onLoad({ filter: /node_modules\/@vue\/(.*)\.js$/ }, async (args) => {
        const file = Bun.file(args.path);
        let source = await file.text();

        const replaced = replacedMap.get(normalizePath(args.path));

        if (replaced) {
          return {
            contents: replaced,
            loader: 'js',
          }
        }

        // Replace Vue Feature Flags
        // This is a workaround for Bun's lack of support for define in dev
        const vueFlags = {
          '__VUE_PROD_DEVTOOLS__': opts.prodDevTools ? 'true' : 'false',
          '__VUE_OPTIONS_API__': opts.optionsApi ? 'true' : 'false',
          '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': opts.prodHydrationMismatchDetails ? 'true' : 'false',
        };

        Object.entries(vueFlags).forEach(([key, value]) => {
          const rgx = new RegExp(`${key}`, 'g');
          source = source.replace(rgx, value);
        });

        // TODO: These are big strings being cached
        // We should consider a more efficient caching strategy
        replacedMap.set(args.path, source);

        return {
          contents: source,
          loader: 'js',
        }
      })
    }
  }
}

const bunPlugin: BunPlugin = /*@__PURE__*/ plugin({ });
export default bunPlugin;

export { plugin as VuePlugin, type VuePluginOptions };