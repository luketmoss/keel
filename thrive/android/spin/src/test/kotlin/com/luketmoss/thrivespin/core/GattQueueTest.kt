package com.luketmoss.thrivespin.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GattQueueTest {
    @Test
    fun anOperationRunsAtOnceWhenIdleAndTheNextWaitsForItsCallback() {
        val queue = GattQueue()
        val log = mutableListOf<String>()
        queue.add { log += "read"; true }
        queue.add { log += "write"; true }
        queue.add { log += "subscribe"; true }
        assertEquals(listOf("read"), log)
        queue.complete()
        assertEquals(listOf("read", "write"), log)
        queue.complete()
        queue.complete()
        assertEquals(listOf("read", "write", "subscribe"), log)
        assertFalse(queue.isBusy)
    }

    @Test
    fun anOperationTheStackRefusesDoesNotBlockTheOnesBehindIt() {
        val queue = GattQueue()
        val log = mutableListOf<String>()
        queue.add { log += "refused"; false }
        queue.add { log += "ok"; true }
        assertEquals(listOf("refused", "ok"), log)
        assertTrue(queue.isBusy)
    }

    @Test
    fun clearDropsEverythingQueuedAndRunning() {
        val queue = GattQueue()
        val log = mutableListOf<String>()
        queue.add { log += "one"; true }
        queue.add { log += "two"; true }
        queue.clear()
        assertFalse(queue.isBusy)
        queue.complete()
        assertEquals(listOf("one"), log)
        queue.add { log += "three"; true }
        assertEquals(listOf("one", "three"), log)
    }
}
