import { Glob, type BunPlugin } from "bun";
import { join, parse } from 'node:path'
import { parseSvg } from "./parse-svg.ts";

const filesGlob = new Glob("**/*.svg");

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

        const parsed = parseSvg(text)
        if (!parsed) {
          console.warn(`icon ${routeFile} is not SVG icon`)
          continue
        }

        _keys.push(`"${iconName}": \`${parsed.body}\``)
        _attrs.push(`"${iconName}": ${JSON.stringify(parsed.attrs)}`)
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
