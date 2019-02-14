import * as jwtDecode from "jwt-decode";
import { UserAgentApplication } from "msal";
import { Action } from "redux";
import { SagaIterator } from "redux-saga";
import { all, call, delay, put, takeLatest } from "redux-saga/effects";

import * as Constants from "./Constants";
import * as Types from "./Types";

let userAgentApplication: UserAgentApplication = null;

function* accessTokenReceived(action: Types.IMsalAccessTokenReceivedAction): any {
    yield delay(600000);
    yield call(acquireNewAccessToken, action.scopes);
}

function* acquireNewAccessToken(scopes: string[]): SagaIterator {
    try {
        const accessToken: string = yield (userAgentApplication.acquireTokenSilent(
            scopes,
            null,
            userAgentApplication.getUser(),
        ) as any);

        const decodedToken: any = jwtDecode(accessToken);

        yield put({
            type: Constants.MSAL_ACCESS_TOKEN_RECEIVED,
            accessToken,
            scopes,
            user: {
                ...userAgentApplication.getUser(),
                roles: decodedToken.roles || [],
            },
        } as Types.IMsalAccessTokenReceivedAction);
    } catch (error) {
        yield put({ type: Constants.MSAL_SIGN_IN_FAILURE, error } as Types.IMsalSignInFailureAction);
    }
}

function* signIn(action: Types.IMsalSignInAction): SagaIterator {
    const scopes: string[] = action.scopes || [userAgentApplication.clientId];

    if (userAgentApplication.isCallback(window.location.hash)) {
        // Already handled in userAgentApplication constructor
        yield put({ type: Constants.MSAL_CALLBACK_PROCESSED });
    }

    const user = userAgentApplication.getUser();
    const currentTime = Math.ceil(Date.now() / 1000);
    const tokenExpired = user ? ((user.idToken as any).exp < currentTime) : false;

    if (user && !tokenExpired) {
        yield call(acquireNewAccessToken, scopes);
    } else {
        const popup: boolean = action.popup || false;

        if (popup) {
            try {
                const accessToken: string = yield (userAgentApplication.loginPopup(scopes) as any);

                yield put({
                    type: Constants.MSAL_ACCESS_TOKEN_RECEIVED,
                    accessToken,
                    scopes,
                    user: userAgentApplication.getUser(),
                } as Types.IMsalAccessTokenReceivedAction);
            } catch (error) {
                yield put({ type: Constants.MSAL_SIGN_IN_FAILURE, error } as Types.IMsalSignInFailureAction);
            }
        } else {
            userAgentApplication.loginRedirect(scopes);
        }
    }
}

function* signOut(action: Action): SagaIterator {
    if (userAgentApplication.getUser()) {
        userAgentApplication.logout();
    }
}

export function* msalSaga(clientId: string, authority: string, options?: Types.IMsalOptions): SagaIterator {
    const mergedOptions: Types.IMsalOptions = {
        redirectUri: window.location.origin + "/",
        // Avoid redirection on url callback
        navigateToLoginRequestUrl: false,
        ...options,
    };

    userAgentApplication = new UserAgentApplication(clientId, authority, null, mergedOptions);

    yield all([
        takeLatest(Constants.MSAL_ACCESS_TOKEN_RECEIVED, accessTokenReceived),
        takeLatest(Constants.MSAL_SIGN_IN, signIn),
        takeLatest(Constants.MSAL_SIGN_OUT, signOut),
    ]);
}
