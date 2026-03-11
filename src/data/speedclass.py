from math import sqrt, floor

s = [180, 12, 30, 250]      # Score 90%
s = [0, 80, 150, 200]		# Score 35%
s = [80, 80, 80, 80]		# Score 40%
s = [25, 100, 30, 250]		# Score 40%
s = [12, 40, 100, 20]		# Score 20%
s = [160, 140, 100, 150]	# Score 80%

s = [x + 1 if x == 0 else x for x in s]		# avoid zero kilometer count
w = [1, .8, .3, .15]                        # weights for 
d = [150, 125, 100, 75]                     # class determinants absolute kilometers
gridSize = 1.0                              # 1.0 = 1 degree, 0.5 = half degree
d = [x * gridSize for x in d]				# d weighted against gridize

rules = [
    (5, [(0, d[0])]),
    (4, [(0, d[1]), (1, d[0])]),
    (3, [(0, d[2]), (1, d[1])]),
    (2, [(0, d[3]), (1, d[2]), (2, d[0])]),
    (1, [(0, d[3]), (1, d[3]), (2, d[1])]),
]

# Primary speed classification: How many absolute kilometer are there?
baseSpeedClass = 0
for score, conditions in rules:
    if any(s[i] >= limit for i, limit in conditions):
        baseSpeedClass = score
        break

# Secondary speed classification: How much road/travel capacity exists overall?
densityScore		= sqrt(sum(x * y for x, y in zip(s, w)))

# Secondary speed classification: Are the speed bands somewhat evenly filled?
balanceScore		= min(s) / max(s)

# Secondary speed classification: Are strong bands concentrated in the fast categories?
bandRatioScore		= (
    w[0] * (s[0] / s[1]) +
    w[1] * (s[1] / s[2]) +
    w[2] * (s[2] / s[3])
)

# Secondary speed classification: How meaningful is medium/far access?
reachScore			= sqrt(s[2] + s[3])

# Scoring of the speed classifications
speedClassScored = (
    baseSpeedClass
    + 0.05 * densityScore
    + 2.0 * balanceScore
    + 0.1 * bandRatioScore
    + 0.1 * reachScore
)

def round_half_up(f, n):
    m = 10 ** n
    return floor(f * m + 0.5) / m

def clamp(f, bounds):
    if f < bounds[0]:
        return bounds[0]
    elif f > bounds[1]:
        return bounds[1]
    return f

# speedClass brought within bounds, normalized (0-1) and rounded.
speedClass = round_half_up(0.1 * clamp(speedClassScored, bounds=[0, 10]), 2)

print(baseSpeedClass, densityScore, balanceScore, bandRatioScore, reachScore, speedClass)