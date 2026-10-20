package com.luketmoss.thrivesip.core

/** Water is stored in ml and shown in oz, the way the Day cards show it (#520). */
object Volume {
    const val ML_PER_OZ = 29.5735

    /** What "+ 4 oz" logs. */
    const val QUICK_WATER_ML = 118

    /** ml ÷ 29.5735, one decimal, a trailing `.0` dropped: 1893 is "64", 118 is "4". */
    fun formatOz(ml: Int): String {
        val tenths = Math.floor(ml / ML_PER_OZ * 10 + 0.5).toLong()
        return if (tenths % 10 == 0L) (tenths / 10).toString() else "${tenths / 10}.${tenths % 10}"
    }
}
