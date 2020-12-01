import * as defaultView from './view/code.js'

export class ViewOf extends HTMLElement {
  static rendering = new Set

  static didStartRendering(element) {
    this.rendering.add(element)
  }

  static didFinishRendering(element) {
    this.rendering.delete(element)
    if (!this.rendering.size && this._resolveRendered) {
      this._resolveRendered()
      this._resolveRendered = null
      this._renderedPromise = null
    }
  }

  static _renderedPromise = null
  static _resolveRendered = null  
  static get rendered() {
    if (!this._renderedPromise && !this.rendering.size) return Promise.resolve()
    if (this._renderedPromise) return this._renderedPromise
    if (this.rendering.size) {
      return this._renderedPromise
        = new Promise(resolve => this._resolveRendered = resolve)      
    }
  }

  async connectedCallback() {
    try {
      ViewOf.didStartRendering(this)
      if (!this.isConnected) return
      const src = this.getAttribute('src')
      if (!src) return
      const source = this.source = new URL(src, this.ownerDocument.location)    
      const extension = /\.([a-zA-Z0-9_]+)$/g.exec(source.pathname)
      this.extension = extension && extension[1]
      const {fragment} = this
      let region = {
        start: {line: 0}
      }
      if (fragment) {
        const models = [
          import('./model/lines.js'),
          import('./model/regions.js')
        ]

        if (extension) models.push(import(`./model/${extension[1]}.js`))
        const find = index(...models)

        const [beginFrag, endFrag=beginFrag] = fragment.split('...')
        const startRegion = await find(this, beginFrag)
        if (startRegion) region.start = startRegion.start
        const endRegion = await find(this, endFrag)
        if (endRegion) region.end = endRegion.end
      }
      this.region = region

      const renderer = await import(`./view/${this.getAttribute('view') || this.extension}.js`)
          .catch(_ => defaultView)
      this.renderer = await renderer.default(this)
    } finally {
      ViewOf.didFinishRendering(this)
    }
  }

  disconnectedCallback() {
    if (!this.renderer) return
    if (typeof this.renderer === 'function') {
      // destructor function
      this.renderer()
    } else if (typeof this.renderer.detach === 'function') {
      this.renderer.detach()
    }

    this.renderer = null
  }

  _fetchSource = null
  _fetch = null
  get fetch() {
    if (this.source === this._fetchSource)
      return this._fetch
    this._fetchSource = this.source
    return this._fetch = fetch(this.source)
  }

  get(model) {
    return model(this.fetch)
  }

  get title() {
    return this.getAttribute('title') || this.source.pathname
  }

  get fragment() {
    return this.source.hash.slice(1)
  }

  get output() {
    const [output] = this.getElementsByTagName('view-out')
    if (output) return output
    const created = this.ownerDocument.createElement('view-out')
    this.appendChild(created)
    return created
  }

  renderer = null
}

customElements.define('view-of', ViewOf)

function index(...models) {
  return async (view, name) => {
    for (const model of models) {
      try {
        const m = await model
        const regions = await view.get(m.default)
        if (regions[name]) return regions[name]
      } catch(err) { console.error(err) }
    }
    return null
  }
}