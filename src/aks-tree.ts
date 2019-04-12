import * as vscode from 'vscode';
import { AzureAccount, AzureSession } from './azure-account';
import { SubscriptionClient, ResourceManagementClient } from 'azure-arm-resource';

export class AKSTreeProvider implements vscode.TreeDataProvider<AKSTreeNode> {
    onDidChangeTreeData?: vscode.Event<AKSTreeNode | null | undefined> | undefined = undefined;

    getTreeItem(element: AKSTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element.nodeType === 'error') {
            return new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
        } else if (element.nodeType === 'subscription') {
            return new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
        } else {
            const treeItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
            treeItem.contextValue = "aks.cluster";
            return treeItem;
        }
    }

    getChildren(element?: AKSTreeNode | { nodeType: 'cloud' } | undefined): vscode.ProviderResult<AKSTreeNode[]> {
        if (!element || element.nodeType === 'cloud') {
            return subscriptions();
        } else if (element.nodeType === 'subscription') {
            return clusters(element.session, element.subscription);
        } else {
            return [];
        }
    }
}

async function subscriptions(): Promise<AKSTreeNode[]> {
    const azureAccount: AzureAccount = vscode.extensions.getExtension<AzureAccount>('ms-vscode.azure-account')!.exports;
    if (azureAccount.status === 'LoggedIn') {
        await azureAccount.waitForFilters();
        const subscriptionItems = Array.of<AKSTreeNode>();
        for (const session of azureAccount.sessions) {
            const subscriptionClient = new SubscriptionClient.SubscriptionClient(session.credentials);
            const subscriptions = await listAll(subscriptionClient.subscriptions, subscriptionClient.subscriptions.list());
            subscriptionItems.push(...subscriptions
                .filter((s) => azureAccount.filters.some((f) => f.subscription.subscriptionId === s.subscriptionId))
                .map((s) => asSubscriptionTreeNode(session, s)));
        }
        return subscriptionItems;
    }
    return [ { nodeType: 'error', message: 'Please log in' } ];
}

function asSubscriptionTreeNode(session: AzureSession, sub: SubscriptionClient.SubscriptionModels.Subscription): AKSSubscriptionTreeNode {
    return {
        nodeType: 'subscription',
        name: sub.displayName || '',
        session,
        subscription: sub
    };
}

async function clusters(session: AzureSession, subscription: SubscriptionClient.SubscriptionModels.Subscription): Promise<AKSTreeNode[]> {
    const azureAccount: AzureAccount = vscode.extensions.getExtension<AzureAccount>('ms-vscode.azure-account')!.exports;
    if (azureAccount.status === 'LoggedIn') {
        const client = new ResourceManagementClient.ResourceManagementClient(session.credentials, subscription.subscriptionId!);
        const aksClusters = await listAll(client.resources, client.resources.list({ filter: "resourceType eq 'Microsoft.ContainerService/managedClusters'" }));
        return aksClusters.map((c) => ({
            nodeType: 'cluster',
            name: c.name || '',
            armId: c.id || '',
            session,
            subscription
        }));
    }
    return [ { nodeType: 'error', message: 'Please log in' } ];
}

export interface AKSErrorTreeNode {
    readonly nodeType: 'error';
    readonly message: string;
}

export interface AKSSubscriptionTreeNode {
    readonly nodeType: 'subscription';
    readonly name: string;
    readonly session: AzureSession;
    readonly subscription: SubscriptionClient.SubscriptionModels.Subscription;
}

export interface AKSClusterTreeNode {
    readonly nodeType: 'cluster';
    readonly armId: string;
    readonly name: string;
    readonly session: AzureSession;
    readonly subscription: SubscriptionClient.SubscriptionModels.Subscription;
}

export type AKSTreeNode = AKSClusterTreeNode | AKSSubscriptionTreeNode | AKSErrorTreeNode;

export interface PartialList<T> extends Array<T> {
    nextLink?: string;
}

async function listAll<T>(client: { listNext(nextPageLink: string): Promise<PartialList<T>>; }, first: Promise<PartialList<T>>): Promise<T[]> {
    const all: T[] = [];
    for (let list = await first; list.length || list.nextLink; list = list.nextLink ? await client.listNext(list.nextLink) : []) {
        all.push(...list);
    }
    return all;
}
