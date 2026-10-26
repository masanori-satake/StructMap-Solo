export class TreeExpansionState {
  private readonly expanded = new Set<string>();

  public expand(id: string): void {
    this.expanded.add(id);
  }

  public collapse(id: string): void {
    this.expanded.delete(id);
  }

  public isExpanded(id: string): boolean {
    return this.expanded.has(id);
  }

  public snapshot(): ReadonlySet<string> {
    return new Set(this.expanded);
  }

  public clear(): void {
    this.expanded.clear();
  }
}
