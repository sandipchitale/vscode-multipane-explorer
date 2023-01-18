import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as path from 'path';

class FileFolderNode extends vscode.TreeItem {
    constructor(
        public kubectl: k8s.KubectlV1,
        public namespace: string,
        public podName: string,
        public containerName: string,
        public path: string,
        public name: string,
        public type: vscode.FileType) {
        super(path === '/' ? `[ ${namespace}/${podName}.${containerName} ] ${path}` : name,
            (type === vscode.FileType.Directory ?
                (path === '/' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
                vscode.TreeItemCollapsibleState.None));
        this.iconPath = new vscode.ThemeIcon(type === vscode.FileType.Directory ? 'folder' : 'file');
        this.contextValue =(type === vscode.FileType.Directory ? 'k8sexplorerfolder' : 'k8sexplorerfile');
    }
}

export class K8SContainerFileSystemProvider implements vscode.TreeDataProvider<FileFolderNode> {
    constructor(
        private kubectl: k8s.KubectlV1,
        private namespace: string,
        private podName: string,
        private container: string
    ) {}

    onDidChangeTreeData?: vscode.Event<void | FileFolderNode | FileFolderNode[] | null | undefined> | undefined;

    getTreeItem(element: FileFolderNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: FileFolderNode | undefined): vscode.ProviderResult<FileFolderNode[]> {
        if (!element) {
            return [
                new FileFolderNode(
                    this.kubectl,
                    this.namespace,
                    this.podName,
                    this.container,
                    '/',
                    '',
                    vscode.FileType.Directory)
            ];
        } else {
            return this.getChildrenImpl(element);
        }
    }

    async getChildrenImpl(element: FileFolderNode): Promise<FileFolderNode[]> {
        if (element.type === vscode.FileType.Directory) {
            const lsResult = await element.kubectl.invokeCommand(
                `exec -it ${element.podName} ${element.containerName ? '-c ' + element.containerName : ''} --namespace ${element.namespace} -- ls -F ${element.path}`);
            if (!lsResult || lsResult.code !== 0) {
                console.log(`Can't get resource usage: ${lsResult ? lsResult.stderr : 'unable to run kubectl'}`);
                return [];
            }
            const lsCommandOutput = lsResult.stdout;
            if (lsCommandOutput.trim().length > 0) {
                const fileNames = lsCommandOutput.split('\n').filter((fileName) => fileName && fileName.trim().length > 0);
                return fileNames.map((fileName) => {
                    return new FileFolderNode(
                        element.kubectl,
                        element.namespace,
                        element.podName,
                        element.containerName,
                        element.path + fileName,
                        fileName,
                        fileName.endsWith('/') ? vscode.FileType.Directory : vscode.FileType.File);
                });
            }
        }
        return [];
    }

    getParent?(element: FileFolderNode): vscode.ProviderResult<FileFolderNode> {
        return null;
    }

    resolveTreeItem?(item: vscode.TreeItem, element: FileFolderNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        return element;
    }
}

class EmptyNode extends vscode.TreeItem {
    constructor() {
        super('', vscode.TreeItemCollapsibleState.None);
    }
}


export class EmptyTreeDataProvider implements vscode.TreeDataProvider<EmptyNode> {
    onDidChangeTreeData?: vscode.Event<void | EmptyNode | EmptyNode[] | null | undefined> | undefined;
    getTreeItem(element: EmptyNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new EmptyNode();
    }
    getChildren(element?: EmptyNode | undefined): vscode.ProviderResult<EmptyNode[]> {
        return [];
    }
    getParent?(element: EmptyNode): vscode.ProviderResult<EmptyNode> {
        return null;
    }
    resolveTreeItem?(item: vscode.TreeItem, element: EmptyNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
        return element;
    }
}

export class K8SContainerFileExplorer {
    static counter = 0;
    private static emptyTreeDataProvider: vscode.TreeDataProvider<EmptyNode>;
    private treeView: vscode.TreeView<FileFolderNode> | undefined;

    static {
        K8SContainerFileExplorer.emptyTreeDataProvider = new EmptyTreeDataProvider();
        (async () => {
            const kubectl = await k8s.extension.kubectl.v1;
            if (kubectl.available) {
                vscode.commands.registerCommand('k8scontainerfileexplorer.ls-al', K8SContainerFileExplorer.open);
                vscode.commands.registerCommand('k8scontainerfileexplorer.view', K8SContainerFileExplorer.open);
                vscode.commands.registerCommand('k8scontainerfileexplorer.copy-from', K8SContainerFileExplorer.copyFrom);
                vscode.commands.registerCommand('k8scontainerfileexplorer.copy-to-from-folder', K8SContainerFileExplorer.copyToFromFolder);
                vscode.commands.registerCommand('k8scontainerfileexplorer.copy-to-from-file', K8SContainerFileExplorer.copyToFromFile);
            }
        })();
    }

    constructor(private context: vscode.ExtensionContext, private id: string) {
        vscode.commands.registerCommand(`${id}.trash`, () => this.trash(this));
    }

    async createTreeView(namespace: string, pod: string, container: string) {
        const kubectl = await k8s.extension.kubectl.v1;
        if (kubectl.available) {
            const treeDataProvider = new K8SContainerFileSystemProvider(kubectl.api, namespace, pod, container);
            this.treeView = vscode.window.createTreeView(this.id, { treeDataProvider: treeDataProvider });
            this.context.subscriptions.push(this.treeView);
        }
    }

    async trash(self: K8SContainerFileExplorer) {
        self.treeView = undefined;
        K8SContainerFileExplorer.counter = self.id.endsWith('A') ? 0 : 1;
        self.context.subscriptions.push(vscode.window.createTreeView(self.id, { treeDataProvider: K8SContainerFileExplorer.emptyTreeDataProvider }));
    }

    static async open(treeItem: any) {
        if (treeItem instanceof FileFolderNode) {
            let where = `Namespace: ${treeItem.namespace} Pod: ${treeItem.podName} Container: ${treeItem.containerName} Path: ${treeItem.path}`;
            let command;
            if (treeItem.type === vscode.FileType.Directory) {
                command = '/bin/ls -al';
            } else {
                command = '/bin/cat';
            }
            const catResult = await treeItem.kubectl.invokeCommand(`exec -it ${treeItem.podName} -c ${treeItem.containerName} --namespace ${treeItem.namespace} -- ${command} ${treeItem.path}`);
            if (catResult && catResult.code === 0) {
                let doc = await vscode.workspace.openTextDocument({
                    content: `${where}\n\n${catResult.stdout}`
                });
                await vscode.window.showTextDocument(doc, { preview: false });
            }
        }
    }

    static async copyFrom(treeItem: any) {
        if (treeItem instanceof FileFolderNode) {
            const openDialogOptions: vscode.OpenDialogOptions = {
                openLabel: 'Select the folder to cp to',
                canSelectFiles: false,
                canSelectFolders: true
            };
            const selected = await vscode.window.showOpenDialog(openDialogOptions);
            if (selected) {
                // Have to use a terminal. Does not work with invokeCommand
                const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                terminal.show();
                const fsPath = selected[0].fsPath;
                if (process.platform === 'win32') {
                    terminal.sendText(`cd /D ${fsPath}`);
                } else {
                    terminal.sendText(`cd ${fsPath}`);
                }
                terminal.sendText(`kubectl cp ${treeItem.namespace}/${treeItem.podName}:${treeItem.path} ${treeItem.name} -c ${treeItem.containerName}`);
            }
        }
    }

    static async copyToFromFolder(treeItem: any) {
        if (treeItem instanceof FileFolderNode) {
            if (treeItem.type === vscode.FileType.Directory) {
                const openDialogOptions: vscode.OpenDialogOptions = {
                    openLabel: 'Select the folder to cp',
                    canSelectFiles: false,
                    canSelectFolders: true
                };
                const selected = await vscode.window.showOpenDialog(openDialogOptions);
                if (selected) {
                    // Have to use a terminal. Does not work with invokeCommand.
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    const fsPath = selected[0].fsPath;
                    const dirname = path.dirname(fsPath);
                    const basename = path.basename(fsPath);
                    if (process.platform === 'win32') {
                        terminal.sendText(`cd /D ${dirname}`);
                    } else {
                        terminal.sendText(`cd ${dirname}`);
                    }
                    terminal.sendText(`kubectl cp ${basename} ${treeItem.namespace}/${treeItem.podName}:${treeItem.path} -c ${treeItem.containerName}`);
                }
            }
        }
    }

    static async copyToFromFile(treeItem: any) {
        if (treeItem instanceof FileFolderNode) {
            if (treeItem.type === vscode.FileType.Directory) {
                const openDialogOptions: vscode.OpenDialogOptions = {
                    openLabel: 'Select the file to cp',
                    canSelectFiles: true,
                    canSelectFolders: false
                };
                const selected = await vscode.window.showOpenDialog(openDialogOptions);
                if (selected) {
                    // Have to use a terminal. Does not work with invokeCommand
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    const fsPath = selected[0].fsPath;
                    const dirname = path.dirname(fsPath);
                    const basename = path.basename(fsPath);
                    if (process.platform === 'win32') {
                        terminal.sendText(`cd /D ${dirname}`);
                    } else {
                        terminal.sendText(`cd ${dirname}`);
                    }
                    terminal.sendText(`kubectl cp ${basename} ${treeItem.namespace}/${treeItem.podName}:${treeItem.path} -c ${treeItem.containerName}`);

                }
            }
        }
    }
}