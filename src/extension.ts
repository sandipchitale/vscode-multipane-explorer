'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { FileExplorer } from './fileExplorer';
import { K8SContainerFileExplorer } from './k8scontainerfileExplorer';
import { DockerContainerFileExplorer } from './dockercontainerfileExplorer';

export function activate(context: vscode.ExtensionContext) {
    const k8sContainerFileExplorerA = new K8SContainerFileExplorer(context,
        'k8scontainerfileexplorerA');
    const k8sContainerFileExplorerB = new K8SContainerFileExplorer(context,
        'k8scontainerfileexplorerB');

    context.subscriptions.push(
        vscode.commands.registerCommand('k8s.pod.container.filesystem-explorer-select-container', async (target: any) => {
            if (target && target.nodeType === 'resource' && target.kind.manifestKind === 'Pod') {
                const k8sContainerFileExplorer = (K8SContainerFileExplorer.counter++ % 2 === 0) ? k8sContainerFileExplorerA : k8sContainerFileExplorerB;
                const kubectl = await k8s.extension.kubectl.v1;
                if (kubectl.available) {
                    const containersResult = await kubectl.api.invokeCommand(
                        `get pods ${target.name} --namespace ${target.namespace} -o jsonpath="{.spec.containers[*].name}`);
                    if (!containersResult || containersResult.code !== 0) {
                        console.log(`Can't get containers`);
                        return [];
                    }
                    const containersCommandOutput = containersResult.stdout;
                    if (containersCommandOutput.trim().length > 0) {
                        const containerNames = containersCommandOutput.split('\n').filter((containerName) => containerName && containerName.trim().length > 0);
                        if (containerNames.length === 1) {
                            k8sContainerFileExplorer.createTreeView(
                                                target.namespace,
                                                target.name,
                                                containerNames[0]);
                        } else {
                            const selectedContainerName = await vscode.window.showQuickPick(containerNames, { title: 'Select a container' });
                            if (selectedContainerName) {
                                k8sContainerFileExplorer.createTreeView(
                                    target.namespace,
                                    target.name,
                                    selectedContainerName);
                            }
                        }
                    }
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('k8s.pod.container.filesystem-explorer', (target: any) => {
            if (target && target.nodeType === 'extension') {
                const k8sContainerFileExplorer = (K8SContainerFileExplorer.counter++ % 2 === 0) ? k8sContainerFileExplorerA : k8sContainerFileExplorerB;
                k8sContainerFileExplorer.createTreeView(
                    target.impl.namespace,
                    target.impl.podName,
                    target.impl.containerName || target.impl.name);
            }
        })
    );

    const dockerContainerFileExplorerA = new DockerContainerFileExplorer(context,
        'dockercontainerfileexplorerA');
    const dockerContainerFileExplorerB = new DockerContainerFileExplorer(context,
        'dockercontainerfileexplorerB');

    context.subscriptions.push(
        vscode.commands.registerCommand('docker.container.filesystem-explorer', (target: any) => {
            const dockerContainerFileExplorer = (DockerContainerFileExplorer.counter++ % 2 === 0) ? dockerContainerFileExplorerA : dockerContainerFileExplorerB;
                dockerContainerFileExplorer.createTreeView(target.containerName);
        })
    );

    new FileExplorer(context, 'fileexplorerA');
    new FileExplorer(context, 'fileexplorerB');
}

// this method is called when your extension is deactivated
export function deactivate() {}
