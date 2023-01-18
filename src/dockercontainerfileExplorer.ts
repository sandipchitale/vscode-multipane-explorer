import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';

class DockerFileFolderNode extends vscode.TreeItem {
    constructor(
        public containerName: string,
        public path: string,
        public name: string,
        public type: vscode.FileType) {
        super(path === '/' ? `[ ${containerName} ] ${path}` : name,
            (type === vscode.FileType.Directory ?
                (path === '/' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
                    vscode.TreeItemCollapsibleState.None));
        this.iconPath = new vscode.ThemeIcon(type === vscode.FileType.Directory ? 'folder' : 'file');
        this.contextValue =(type === vscode.FileType.Directory ? 'dockerexplorerfolder' : 'dockerexplorerfile');
    }
}

export class DockerContainerFileSystemProvider implements vscode.TreeDataProvider<DockerFileFolderNode> {
    constructor(
        private container: string
    ) {}

    onDidChangeTreeData?: vscode.Event<void | DockerFileFolderNode | DockerFileFolderNode[] | null | undefined> | undefined;

    getTreeItem(element: DockerFileFolderNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: DockerFileFolderNode | undefined): vscode.ProviderResult<DockerFileFolderNode[]> {
        if (!element) {
            return [
                new DockerFileFolderNode(
                    this.container,
                    '/',
                    '',
                    vscode.FileType.Directory)
            ];
        } else {
            return this.getChildrenImpl(element);
        }
    }

    async getChildrenImpl(element: DockerFileFolderNode): Promise<DockerFileFolderNode[]> {
        if (element.type === vscode.FileType.Directory) {
            try {
                const lsCommandOutput = child_process.execSync(`docker exec -i ${element.containerName} /bin/ls -F ${element.path}`).toString();
                if (lsCommandOutput.trim().length > 0) {
                    const fileNames = lsCommandOutput.split('\n').filter((fileName) => fileName && fileName.trim().length > 0);
                    return fileNames.map((fileName) => {
                        return new DockerFileFolderNode(
                            element.containerName,
                            element.path + fileName,
                            fileName,
                            fileName.endsWith('/') ? vscode.FileType.Directory : vscode.FileType.File);
                    });
                }
            } catch (e) {
                console.error(e);
            }
        }
        return [];
    }

    getParent?(element: DockerFileFolderNode): vscode.ProviderResult<DockerFileFolderNode> {
        return null;
    }

    resolveTreeItem?(item: vscode.TreeItem, element: DockerFileFolderNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        return element;
    }
}

class DockerEmptyNode extends vscode.TreeItem {
    constructor() {
        super('', vscode.TreeItemCollapsibleState.None);
    }
}
export class DockerEmptyTreeDataProvider implements vscode.TreeDataProvider<DockerEmptyNode> {
    onDidChangeTreeData?: vscode.Event<void | DockerEmptyNode | DockerEmptyNode[] | null | undefined> | undefined;
    getTreeItem(element: DockerEmptyNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new DockerEmptyNode();
    }
    getChildren(element?: DockerEmptyNode | undefined): vscode.ProviderResult<DockerEmptyNode[]> {
        return [];
    }
    getParent?(element: DockerEmptyNode): vscode.ProviderResult<DockerEmptyNode> {
        return null;
    }
    resolveTreeItem?(item: vscode.TreeItem, element: DockerEmptyNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        return element;
    }
}

export class DockerContainerFileExplorer {
    static counter = 0;
    private static emptyTreeDataProvider: vscode.TreeDataProvider<DockerEmptyNode>;
    private treeView: vscode.TreeView<DockerFileFolderNode> | undefined;

    static {
        DockerContainerFileExplorer.emptyTreeDataProvider = new DockerEmptyTreeDataProvider();
        vscode.commands.registerCommand('dockercontainerfileexplorer.ls-al', DockerContainerFileExplorer.open);
        vscode.commands.registerCommand('dockercontainerfileexplorer.view', DockerContainerFileExplorer.open);
    }

    constructor(private context: vscode.ExtensionContext, private id: string) {
        vscode.commands.registerCommand(`${id}.trash`, () => this.trash(this));
    }

    async createTreeView(container: string) {
        const treeDataProvider = new DockerContainerFileSystemProvider(container);
        this.treeView = vscode.window.createTreeView(this.id, { treeDataProvider: treeDataProvider });
        this.context.subscriptions.push(this.treeView);
    }

    async trash(self: DockerContainerFileExplorer) {
        self.treeView = undefined;
        DockerContainerFileExplorer.counter = self.id.endsWith('A') ? 0 : 1;
        self.context.subscriptions.push(vscode.window.createTreeView(self.id, { treeDataProvider: DockerContainerFileExplorer.emptyTreeDataProvider }));
    }

    static async open(treeItem: any) {
        if (treeItem instanceof DockerFileFolderNode) {
            let where = `Container: ${treeItem.containerName} Path: ${treeItem.path}`;
            let command;
            if (treeItem.type === vscode.FileType.Directory) {
                command = '/bin/ls -al';
            } else {
                command = '/bin/cat';
            }

            try {
                const commandOutput = child_process.execSync(`docker exec -i ${treeItem.containerName} ${command} ${treeItem.path}`).toString();
                if (commandOutput !== undefined) {
                    let doc = await vscode.workspace.openTextDocument({
                        content: `${where}\n\n${commandOutput}`
                    });
                    await vscode.window.showTextDocument(doc, { preview: false });
                }
            } catch (e) {
                console.error(e);
            }
        }
    }
}