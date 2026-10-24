import * as vscode from 'vscode';

export interface ViewState {
  showTypes: boolean;
  showRoot: boolean;
  treeStyle: 'unicode' | 'ascii';
}

export const DEFAULT_VIEW_STATE: Readonly<ViewState> = {
  showTypes: true,
  showRoot: true,
  treeStyle: 'unicode',
};

export const VIEW_STATE_KEY = 'structmap.viewState';

export class ViewStateManager {
  private readonly memento: vscode.Memento;

  constructor(contextOrMemento: vscode.ExtensionContext | vscode.Memento) {
    if ('globalState' in contextOrMemento) {
      this.memento = contextOrMemento.globalState;
    } else {
      this.memento = contextOrMemento;
    }
  }

  public getState(): ViewState {
    const stored = this.memento.get<Partial<ViewState>>(VIEW_STATE_KEY);
    return {
      showTypes:
        typeof stored?.showTypes === 'boolean'
          ? stored.showTypes
          : DEFAULT_VIEW_STATE.showTypes,
      showRoot:
        typeof stored?.showRoot === 'boolean'
          ? stored.showRoot
          : DEFAULT_VIEW_STATE.showRoot,
      treeStyle:
        stored?.treeStyle === 'unicode' || stored?.treeStyle === 'ascii'
          ? stored.treeStyle
          : DEFAULT_VIEW_STATE.treeStyle,
    };
  }

  public async updateState(newState: Partial<ViewState>): Promise<ViewState> {
    const current = this.getState();
    const updated: ViewState = {
      ...current,
      ...newState,
    };
    await this.memento.update(VIEW_STATE_KEY, updated);
    return updated;
  }

  public async setShowTypes(showTypes: boolean): Promise<ViewState> {
    return this.updateState({ showTypes });
  }

  public async setShowRoot(showRoot: boolean): Promise<ViewState> {
    return this.updateState({ showRoot });
  }

  public async setTreeStyle(
    treeStyle: 'unicode' | 'ascii'
  ): Promise<ViewState> {
    return this.updateState({ treeStyle });
  }

  public async resetState(): Promise<ViewState> {
    await this.memento.update(VIEW_STATE_KEY, undefined);
    return { ...DEFAULT_VIEW_STATE };
  }
}
