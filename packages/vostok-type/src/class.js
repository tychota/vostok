import DataLoader from "dataloader";

export class Type {
  static model: any;
  static loader: any;

  data: { [param: string]: any };
  viewer: { _id: number };

  constructor(model) {
    this.model = require(this.modelName);

    this.loader = new DataLoader(ids => Promise.all(ids.map(id => this.model.findOne({ _id: id }))));
  }

  static viewerCanSee() {
    return true;
  }

  async load(viewer, id) {
    if (!id) return null;

    const data = await Type._loader.load(id);

    if (!data) return null;

    return this.viewerCanSee(viewer, data) ? new this(data, viewer) : null;
  }
}
