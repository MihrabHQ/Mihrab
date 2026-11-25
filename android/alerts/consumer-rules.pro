# The alerts' engine (notifee, in-tree). Nothing in it is renamed or removed:
# alarms, WorkManager rows and the Room database of an installed app name
# these classes (see build.gradle), and the prebuilt AAR this replaces kept
# its public names too. Keeping all of it costs a few kilobytes and leaves
# R8 nothing to get wrong.
-keep class app.notifee.core.** { *; }
-keep class io.invertase.notifee.** { *; }
-dontwarn io.invertase.notifee.**

-keepattributes *Annotation*

# EventBus (notifee's own rules)
-keepclassmembers class * {
    @org.greenrobot.eventbus.Subscribe <methods>;
}
-keep enum org.greenrobot.eventbus.ThreadMode { *; }
-keepclassmembers class * extends org.greenrobot.eventbus.util.ThrowableFailureEvent {
    <init>(java.lang.Throwable);
}

# WorkManager creates the worker by name
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context,androidx.work.WorkerParameters);
}

# The bridge finds these by name, for old and new architecture alike
-keep class com.facebook.react.defaults.DefaultNewArchitectureEntryPoint { *; }
-keep class com.facebook.react.ReactApplication { *; }
-keep class com.facebook.react.ReactHost { *; }
-keep class * extends com.facebook.react.ReactHost { *; }
-keepnames class com.facebook.react.ReactActivity
