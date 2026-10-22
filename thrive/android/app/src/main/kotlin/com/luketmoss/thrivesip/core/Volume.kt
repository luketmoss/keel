package com.luketmoss.thrivesip.core

/** Water is stored in ml and shown in oz, the way the Day cards show it (#520). */
object Volume {
    const val ML_PER_OZ = 29.5735

    /** What "+ 4 oz" logs. */
    const val QUICK_WATER_ML = 118

    /**
     * ml ÷ 29.5735 to the nearest whole ounce: 1893 is "64", 118 is "4".
     * Whole, not tenths, because [QUICK_WATER_ML] is 3.99 oz and tenths would
     * show the shortfall once taps pile up: six taps, 708 ml, read "23.9" (#569).
     */
    fun formatOz(ml: Int): String = Math.floor(ml / ML_PER_OZ + 0.5).toLong().toString()
}
