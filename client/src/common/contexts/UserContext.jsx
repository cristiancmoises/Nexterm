import { createContext, useEffect, useState } from "react";
import LoginDialog from "@/common/components/LoginDialog";
import { getRequest, postRequest } from "@/common/utils/RequestUtil.js";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/common/contexts/ToastContext.jsx";

export const UserContext = createContext({});

export const UserProvider = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();

    const [sessionToken, setSessionToken] = useState(localStorage.getItem("overrideToken")
        || localStorage.getItem("sessionToken"));
    const [firstTimeSetup, setFirstTimeSetup] = useState(false);
    const [user, setUser] = useState(null);
    const {sendToast} = useToast();

    const updateSessionToken = (sessionToken) => {
        setSessionToken(sessionToken);
        localStorage.setItem("sessionToken", sessionToken);
        login();
    };

    const checkFirstTimeSetup = async () => {
        try {
            const response = await getRequest("service/is-fts");
            setFirstTimeSetup(response);
        } catch (error) {
            console.error(error);
        }
    };

    const login = async () => {
        try {
            const userObj = await getRequest("accounts/me");
            setUser(userObj);
        } catch (error) {
            if (error.message === "Unauthorized") {
                setSessionToken(null);
                localStorage.removeItem("sessionToken");
            }
        }
    };

    const logout = async () => {
        await postRequest("auth/logout", { token: sessionToken });

        if (localStorage.getItem("overrideToken")) {
            localStorage.removeItem("overrideToken");
            setSessionToken(localStorage.getItem("sessionToken"));
        }

        login();
    };

    const overrideToken = (token) => {
        localStorage.setItem("overrideToken", token);
        setSessionToken(token);
        login();
    };

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const tokenFromUrl = searchParams.get('token');
        const error = searchParams.get('error');
        
        if (tokenFromUrl) {
            updateSessionToken(tokenFromUrl);
            navigate('/servers', { replace: true });
        } else if (error) {
            sendToast("Error", error);
        }
    }, [location]);

    useEffect(() => {
        sessionToken ? login() : checkFirstTimeSetup();
    }, []);

    return (
        <UserContext.Provider value={{ updateSessionToken, user, sessionToken, firstTimeSetup, login, logout, overrideToken }}>
            <LoginDialog open={!sessionToken} />
            {children}
        </UserContext.Provider>
    );
};