const Folder = require("../models/Folder");
const Server = require("../models/Server");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const { Op } = require("sequelize");
const { hasOrganizationAccess } = require("../utils/permission");

module.exports.createFolder = async (accountId, configuration) => {
    if (configuration.parentId && !configuration.organizationId) {
        const parentFolder = await Folder.findByPk(configuration.parentId);
        if (parentFolder === null) {
            return { code: 302, message: "Parent folder does not exist" };
        }

        if (parentFolder.organizationId) {
            configuration.organizationId = parentFolder.organizationId;
        }
    }

    if (configuration.organizationId) {
        const hasAccess = await hasOrganizationAccess(accountId, configuration.organizationId);
        if (!hasAccess) {
            return { code: 403, message: "You don't have access to this organization" };
        }
    }

    if (configuration.parentId) {
        const parentFolder = await Folder.findByPk(configuration.parentId);
        if (parentFolder === null) {
            return { code: 302, message: "Parent folder does not exist" };
        }

        if (configuration.organizationId && parentFolder.organizationId !== configuration.organizationId) {
            return { code: 403, message: "Parent folder must be in the same organization" };
        } else if (!configuration.organizationId && parentFolder.accountId !== accountId) {
            return { code: 403, message: "You don't have access to the parent folder" };
        }
    }

    return await Folder.create({
        name: configuration.name,
        accountId: configuration.organizationId ? null : accountId,
        organizationId: configuration.organizationId || null,
        parentId: configuration.parentId,
    });
};

module.exports.deleteFolder = async (accountId, folderId) => {
    const folder = await Folder.findByPk(folderId);

    if (folder === null) {
        return { code: 301, message: "Folder does not exist" };
    }

    if (folder.accountId && folder.accountId !== accountId) {
        return { code: 403, message: "You don't have permission to delete this folder" };
    } else if (folder.organizationId) {
        const hasAccess = await hasOrganizationAccess(accountId, folder.organizationId);
        if (!hasAccess) {
            return { code: 403, message: "You don't have access to this organization" };
        }
    }

    let subfolders = await Folder.findAll({ where: { parentId: folderId } });
    for (let subfolder of subfolders) {
        await module.exports.deleteFolder(accountId, subfolder.id);
    }

    await Server.destroy({ where: { folderId: folderId } });

    await Folder.destroy({ where: { id: folderId } });
    return { success: true };
};

module.exports.editFolder = async (accountId, folderId, configuration) => {
    const folder = await Folder.findByPk(folderId);

    if (folder === null) {
        return { code: 301, message: "Folder does not exist" };
    }

    if (folder.accountId && folder.accountId !== accountId) {
        return { code: 403, message: "You don't have permission to edit this folder" };
    } else if (folder.organizationId) {
        const hasAccess = await hasOrganizationAccess(accountId, folder.organizationId);
        if (!hasAccess) {
            return { code: 403, message: "You don't have access to this organization's folders" };
        }
    }

    if (configuration.parentId) {
        let targetFolder = await Folder.findByPk(configuration.parentId);
        if (!targetFolder) {
            return { code: 302, message: "Target parent folder does not exist" };
        }

        if (folder.organizationId && !targetFolder.organizationId) {
            return { code: 403, message: "Cannot move organization folder to personal space" };
        }

        if (targetFolder.organizationId && !folder.organizationId) {
            return { code: 403, message: "Cannot move personal folder to organization space" };
        }

        if (folder.organizationId && targetFolder.organizationId !== folder.organizationId) {
            return { code: 403, message: "Parent folder must be in the same organization" };
        } else if (!folder.organizationId && targetFolder.accountId !== accountId) {
            return { code: 403, message: "You don't have access to the target parent folder" };
        }

        let currentFolder = targetFolder;
        while (currentFolder) {
            if (currentFolder.id === parseInt(folderId)) {
                return { code: 303, message: "Cannot move folder to its own subfolder" };
            }

            if (currentFolder.parentId === null) {
                break;
            }

            currentFolder = await Folder.findByPk(currentFolder.parentId);
        }
    }

    delete configuration.accountId;
    delete configuration.organizationId;

    await Folder.update(configuration, { where: { id: folderId } });

    return { success: true };
};

module.exports.listFolders = async (accountId) => {
    const personalFolders = await Folder.findAll({
        where: { accountId: accountId },
        order: [["parentId", "ASC"], ["position", "ASC"]],
    });

    const memberships = await OrganizationMember.findAll({ where: { accountId, status: "active" } });
    const organizationIds = memberships.map(m => m.organizationId);

    let organizationFolders = [];
    if (organizationIds.length > 0) {
        organizationFolders = await Folder.findAll({
            where: { organizationId: { [Op.in]: organizationIds } },
            order: [["organizationId", "ASC"], ["parentId", "ASC"], ["position", "ASC"]],
        });
    }

    const allFolders = [...personalFolders, ...organizationFolders];

    const folderMap = new Map();
    let rootFolders = [];

    allFolders.forEach(folder => {
        folderMap.set(folder.id, {
            id: folder.id,
            name: folder.name,
            type: "folder",
            position: folder.position,
            organizationId: folder.organizationId,
            entries: [],
        });
    });

    allFolders.forEach(folder => {
        if (folder.parentId) {
            const parentFolder = folderMap.get(folder.parentId);
            if (parentFolder) {
                parentFolder.entries.push(folderMap.get(folder.id));
            } else {
                rootFolders.push(folderMap.get(folder.id));
            }
        } else {
            rootFolders.push(folderMap.get(folder.id));
        }
    });

    const result = [];

    const personalRootFolders = rootFolders.filter(f => !f.organizationId);
    if (personalRootFolders.length > 0) {
        result.push(...personalRootFolders);
    }

    if (organizationIds.length > 0) {
        const organizations = await Organization.findAll({ where: { id: { [Op.in]: organizationIds } } });

        const orgFoldersByOrg = {};
        rootFolders.forEach(folder => {
            if (folder.organizationId) {
                if (!orgFoldersByOrg[folder.organizationId]) {
                    orgFoldersByOrg[folder.organizationId] = [];
                }
                orgFoldersByOrg[folder.organizationId].push(folder);
            }
        });

        organizations.forEach(org => {
            result.push({
                id: `org-${org.id}`,
                name: org.name,
                type: "organization",
                entries: orgFoldersByOrg[org.id] || [],
            });
        });
    }

    return result;
};

module.exports.getFolderById = async (accountId, folderId) => {
    const folder = await Folder.findByPk(folderId);

    if (!folder) {
        return { code: 301, message: "Folder does not exist" };
    }

    if (folder.accountId && folder.accountId !== accountId) {
        return { code: 403, message: "You don't have permission to access this folder" };
    } else if (folder.organizationId) {
        const hasAccess = await hasOrganizationAccess(accountId, folder.organizationId);
        if (!hasAccess) {
            return { code: 403, message: "You don't have access to this organization's folder" };
        }
    }

    return folder;
};
