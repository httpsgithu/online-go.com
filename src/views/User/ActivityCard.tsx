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
import { _, pgettext } from "@/lib/translate";
import { Link } from "react-router-dom";
import { daysOnlyDurationString } from "@/components/TimeControl";
import { Card } from "@/components/material";
import { UserVoteActivityGraph } from "./VoteActivityGraph";
import { CMPieCharts } from "./CMPieCharts";
import { useUser } from "@/lib/hooks";

/** Activity card doesn't care about that many user traits */
interface ActivityCardUser {
    id: number;
    supporter: boolean;
    is_moderator: boolean;
    is_superuser: boolean;
    moderator_powers: number;
    on_vacation: boolean;
    vacation_left: number;
}

interface ActivityCardProps {
    user: ActivityCardUser;
    ladders?: Array<{
        id: number;
        name: string;
        rank: number;
    }>;
    groups?: Array<{
        id: number;
        name: string;
        icon: string;
    }>;
    tournaments?: Array<{
        id: number;
        name: string;
        icon: string;
    }>;
    online_leagues?: Array<{
        name: string;
        membership_id: string;
    }>;
}

export function ActivityCard({
    user,
    ladders,
    groups,
    tournaments,
    online_leagues,
}: ActivityCardProps) {
    const person_looking = useUser();
    return (
        <Card className="activity-card">
            <h4>
                {_("Vacation Accrued:")}{" "}
                {isSpecialUser(user) ? _("(Supporter)") : _("(Non-Supporter)")}
            </h4>
            {!user.on_vacation && <div>{vacationAccrued(user.vacation_left, user)}</div>}
            {user.on_vacation && <div>{_("User On Vacation")}</div>}
            <h4>{_("Ladders")}</h4>
            {ladders?.length ? (
                <div>
                    <dl className="activity-dl">
                        {ladders.map((ladder, idx) => (
                            <dd key={idx}>
                                #{ladder.rank}{" "}
                                <Link to={`/ladder/${ladder.id}`}>{ladder.name}</Link>
                            </dd>
                        ))}
                    </dl>
                </div>
            ) : (
                <div>
                    <div>{_("Not participating in any ladders")}</div>
                </div>
            )}

            <h4>{_("Tournaments")}</h4>
            {tournaments?.length ? (
                <div>
                    <dl className="activity-dl">
                        {tournaments.map((tournament, idx) => (
                            <dd key={idx}>
                                <Link to={`/tournament/${tournament.id}`}>
                                    <img src={tournament.icon} className="icon" /> {tournament.name}
                                </Link>
                            </dd>
                        ))}
                    </dl>
                </div>
            ) : (
                <div>
                    <div>{_("Not participating in any tournaments")}</div>
                </div>
            )}

            <h4>{_("Groups")}</h4>
            {groups?.length ? (
                <div>
                    <dl className="activity-dl">
                        {groups.map((group, idx) => (
                            <dd key={idx}>
                                <Link to={`/group/${group.id}`}>
                                    <img src={group.icon} className="icon" /> {group.name}
                                </Link>
                            </dd>
                        ))}
                    </dl>
                </div>
            ) : (
                <div>
                    <div>{_("Not a member of any groups")}</div>
                </div>
            )}
            {!!online_leagues?.length && (
                <>
                    <h4>{_("Online Leagues")}</h4>
                    <div>
                        <dl className="activity-dl">
                            {online_leagues.map((league, idx) => (
                                <dd key={idx}>
                                    {league.name}
                                    {(league.membership_id || null) && `: ${league.membership_id}`}
                                </dd>
                            ))}
                        </dl>
                    </div>
                </>
            )}
            {!!user.moderator_powers && (
                <>
                    <h4>
                        {pgettext(
                            "Header of 'community moderation activity stats' section",
                            "Community Moderation",
                        )}
                    </h4>
                    <div className="mod-graph-header">
                        {pgettext(
                            "header for a graph showing how often the moderator voted with the others",
                            "consensus votes (by week)",
                        )}
                    </div>
                    <UserVoteActivityGraph user_id={user.id} />
                </>
            )}
            {person_looking?.is_moderator && (
                <CMPieCharts user_id={user.id} user_moderator_powers={user.moderator_powers} />
            )}
        </Card>
    );
}

function vacationAccrued(vacation_time_accrued: number, user: ActivityCardUser) {
    if (isSpecialUser(user)) {
        return daysOnlyDurationString(vacation_time_accrued) + " " + _("out of 60 Days");
    } else {
        return daysOnlyDurationString(vacation_time_accrued) + " " + _("out of 30 Days");
    }
}

function isSpecialUser(user: ActivityCardUser) {
    if (user.supporter || user.is_moderator || user.is_superuser) {
        return true;
    }
    return false;
}
