import "./styles.sass";
import ServerList from "@/pages/Servers/components/ServerList";
import { UserContext } from "@/common/contexts/UserContext.jsx";
import { useContext, useEffect, useState } from "react";
import Button from "@/common/components/Button";
import WelcomeImage from "@/common/img/welcome.png";
import { DISCORD_URL, GITHUB_URL } from "@/App.jsx";
import ServerDialog from "@/pages/Servers/components/ServerDialog";
import ViewContainer from "@/pages/Servers/components/ViewContainer";
import ProxmoxDialog from "@/pages/Servers/components/ProxmoxDialog";
import { mdiStar } from "@mdi/js";
import { siDiscord } from "simple-icons";
import { useActiveSessions } from "@/common/contexts/SessionContext.jsx";
import { useLocation, useNavigate } from "react-router-dom";
import { ServerContext } from "@/common/contexts/ServerContext.jsx";

export const Servers = () => {

    const [serverDialogOpen, setServerDialogOpen] = useState(false);
    const [proxmoxDialogOpen, setProxmoxDialogOpen] = useState(false);

    const [currentFolderId, setCurrentFolderId] = useState(null);
    const [editServerId, setEditServerId] = useState(null);
    const { user } = useContext(UserContext);
    const { activeSessions, setActiveSessions, activeSessionId, setActiveSessionId } = useActiveSessions();
    const { getServerById, getPVEServerById, getPVEContainerById, servers } = useContext(ServerContext);
    const location = useLocation();
    const navigate = useNavigate();

    const connectToServer = (server, identity) => {
        const sessionId = "session-" + (Math.random().toString(36).substring(2, 15));
        setActiveSessions(prevSessions => [...prevSessions, { server, identity, type: "ssh", id: sessionId }]);
        setActiveSessionId(sessionId);
    };

    const openSFTP = (server, identity) => {
        const sessionId = "session-" + (Math.random().toString(36).substring(2, 15));
        setActiveSessions(prevSessions => [...prevSessions, { server, identity, type: "sftp", id: sessionId }]);
        setActiveSessionId(sessionId);
    };

    const connectToPVEServer = (serverId, containerId) => {
        const sessionId = "session-" + (Math.random().toString(36).substring(2, 15));
        setActiveSessions(activeSessions => [...activeSessions, {
            server: serverId.toString().replace("pve-", ""),
            containerId: containerId.toString().split("-")[containerId.toString().split("-").length - 1],
            id: sessionId
        }]);

        setActiveSessionId(sessionId);
    };

    const disconnectFromServer = (sessionId) => {
        setActiveSessions(activeSessions => {
            const newSessions = activeSessions.filter(session => session.id !== sessionId);

            if (newSessions.length === 0) {
                setActiveSessionId(null);
            } else if (sessionId === activeSessionId) {
                setActiveSessionId(newSessions[newSessions.length - 1].id);
            }

            return newSessions;
        });
    };

    const closeDialog = () => {
        setServerDialogOpen(false);
        setCurrentFolderId(null);
        setEditServerId(null);
    };

    const closePVEDialog = () => {
        setProxmoxDialogOpen(false);
        setCurrentFolderId(null);
        setEditServerId(null);
    }

    useEffect(() => {
        if (!servers) return;
        
        const params = new URLSearchParams(location.search);
        const connectId = params.get('connectId');
        
        if (connectId) {
            navigate('/servers', { replace: true });
            const server = getServerById(connectId);
            
            if (server && server.identities && server.identities.length > 0) {
                connectToServer(server.id, server.identities[0]);
            } else {
                const isPveServer = connectId.includes("-");
                
                if (isPveServer) {
                    const [pveId, containerId] = connectId.split("-");
                    const pveServer = getPVEServerById(pveId);
                    const container = pveServer && containerId ? 
                        getPVEContainerById(pveId, containerId) : null;
                    
                    if (pveServer && container && container.status === "running") {
                        connectToPVEServer(pveId, containerId);
                    }
                }
            }
        }
    }, [servers, location.search]);

    return (
        <div className="server-page">
            <ServerDialog open={serverDialogOpen} onClose={closeDialog} currentFolderId={currentFolderId}
                          editServerId={editServerId} />
            <ProxmoxDialog open={proxmoxDialogOpen} onClose={closePVEDialog}
                           currentFolderId={currentFolderId}
                           editServerId={editServerId} />
            <ServerList setServerDialogOpen={() => setServerDialogOpen(true)} connectToServer={connectToServer}
                        connectToPVEServer={connectToPVEServer} setProxmoxDialogOpen={() => setProxmoxDialogOpen(true)}
                        setCurrentFolderId={setCurrentFolderId} setEditServerId={setEditServerId} openSFTP={openSFTP} />
            {activeSessions.length === 0 && <div className="welcome-area">
                <div className="area-left">
                    <h1>Hi, <span>{user?.firstName || "User"} {user?.lastName || "name"}</span>!</h1>
                    <p>Welcome to Nexterm. The open-source server manager for SSH, VNC and RDP.</p>
                    <div className="button-area">
                        <Button text="Star on GitHub" onClick={() => window.open(GITHUB_URL, "_blank")} icon={mdiStar} />
                        <Button text="Join Discord" onClick={() => window.open(DISCORD_URL, "_blank")} icon={siDiscord.path} />
                    </div>
                </div>
                <img src={WelcomeImage} alt="Welcome" />
            </div>}
            {activeSessions.length > 0 &&
                <ViewContainer activeSessions={activeSessions} disconnectFromServer={disconnectFromServer}
                               activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId} />}
        </div>
    );
};