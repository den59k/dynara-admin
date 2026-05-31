import { Glob, type BunPlugin } from "bun";
import { join, parse } from 'node:path'

const filesGlob = new Glob("**/*.svg");

function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

const svgPlugin: BunPlugin = {
  name: "svg-glob-plugin",
  setup(build) {
    build.onResolve({ filter: /\?svg-glob/ }, args => {
      const { dir } = parse(args.importer)
      const path = join(dir, args.path.slice(0, args.path.indexOf("?")))

      return {
        path,
        namespace: "svg-glob"
      }
    })
    build.onLoad({ filter: /.*/, namespace: 'svg-glob' }, async args => {
      let _keys = []
      let _attrs = []
      for await (const routeFile of filesGlob.scan({ cwd: args.path })) {
        const slashIndex = Math.max(routeFile.lastIndexOf("/"), routeFile.lastIndexOf("\\"))
        const iconName = routeFile.slice(slashIndex+1, -4)

        const text = await Bun.file(join(args.path, routeFile)).text()

        const tagInfo = text.match(/^<svg[\s\S]*?>/)?.[0]
        if (!tagInfo) {
          console.warn(`icon ${routeFile} is not SVG icon`)
          continue
        }

        const attrs: Record<string, string> = {};
        [...tagInfo.matchAll(/(\w+)=["']([^"']+)["']/g)].forEach(([_, name, value]) => {
          if (name === "xmlns") return
          attrs[name] = value;
        });

        const icon = text
          .replace(/"#[0-9A-Za-z]+"/g, '"currentColor"')
          .replace(/"white"/g, '"currentColor"')
          .replace(/"black"/g, '"currentColor"')
          .replace(/fill-opacity=".+?"/g, "")
          .replace(/^<svg[\s\S]*?>/, '')  // убрать начало
          .replace(/<\/svg>\s*$/, '')    // убрать конец
          .trim()

        _keys.push(`"${iconName}": \`${icon}\``)
        _attrs.push(`"${iconName}": ${JSON.stringify(attrs)}`)
      }

      const contents = `
export const contents = {
${_keys.join(",\n")}
}

export const attrs = { ${_attrs.join(",\n")} }
`
      return {
        contents,
        loader: "js"
      }
    })
  },
}

export default svgPlugin;