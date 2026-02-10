# KOs
When a fighter goes beyond the KO boundaries, they receive a blast KO. When KOd, they loose a point and the fighter who last landed a hit on them gains one. If a fighter self-destructs (SD), they loose the number of points is set in the config. In stock battles, replace points with lives(stocks) and the fighter that KOd someone does not gain a stock.

# Blast KOs
When a fighter is blast KOd, a massive and cool spark explosion of the same color of the player color (gray for CPU). The spark explosion should all aim for the center of the stage (calculated by camera bounds). Confetti should also shoot out around that direction.

After a KO, the fighter should be removed from the entire scene and respawn after a few seconds. Also make the damage numbers shatter and explode. Once the fighter floats down on the respawn platform, have the numbers reappear.


# KO Respawn
When a fighter respawns from a KO, a little platform will appear over the top camera border and float down just below the top border. It will be centered on the stage. The fighter is on the platform and intangible (not to be confused with invincibility). Respawning fighters should have a respawing attribute that prevents the magnifying glass from affecting the player. The fighter can move or jump off once the platform has come to a hault and is levitating below the top camera border.


# Removing the Respawn platform
When the respawning platform reaches a complete stop in the air, the fighter can perform an action to remove it. Before any action actually starts, the fighter freezes for two frames while the platform disappears on the first frame. This will make the fighter perform that action in the air (mid-air jump instead of a regular jump). We'll need a frameStun attribute to freeze the fighter's state.

If the fighter stands on it after 5, the platform disappears on it's own. The countdown starts once the platform reaches a complete stop. Each second pass, it'll pulse different colors (dark blue as it comes down, to light blue (4), to yellow (3), to orange(2), to red (1), to dark red (0), then disappear). Include the two freeze frames for the fighter there too.

# Elimination
When a fighter looses all their stocks, scale down the damage counter a little and gray out their fighter photo.