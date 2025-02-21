/*
 * Copyright (C)  Online-Go.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as React from "react";
import { browserHistory } from "@/lib/ogsHistory";
import { _ } from "@/lib/translate";
import * as data from "@/lib/data";
import { Card } from "@/components/material";

export class EmailBanner extends React.PureComponent {
    constructor(props: {}) {
        super(props);
        // TODO: Remove this
        this.state = {};
    }

    viewSettings = () => {
        browserHistory.push("/user/settings");
    };

    dismiss = () => {
        data.set("email-banner-dismissed", true);
        this.forceUpdate();
    };

    render() {
        if (data.get("user").email_validated) {
            return null;
        }

        if (data.get("email-banner-dismissed")) {
            return null;
        }

        return (
            <div className="EmailBanner-container">
                <Card className="EmailBanner">
                    <i className="fa fa-times" onClick={this.dismiss} />
                    {_(
                        "Welcome to OGS! Feel free to start playing games. In an effort to reduce spam and limit trolls, chat is disabled for all users until their email address has been validated. To validate your email address, simply click the activation link that has been sent to you.",
                    )}
                    <br />
                    <br />
                    {_(
                        "You can visit the settings page to update your email address or resend the validation email.",
                    )}
                    <button className="primary" onClick={this.viewSettings}>
                        {_("Go to settings")} &rarr;
                    </button>
                </Card>
            </div>
        );
    }
}
