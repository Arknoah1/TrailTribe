import UIKit
import Capacitor
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        //
        // FirebaseApp.configure() reads GoogleService-Info.plist, which this repo does NOT commit
        // (same pattern as Android's google-services.json) — CI writes it from a base64 secret
        // before the build. #if canImport guards keep this file compiling even if the Firebase
        // SPM package or plist is ever missing from a given build.
        #if canImport(FirebaseCore)
        if FirebaseApp.app() == nil, Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        #endif
        return true
    }

    // MARK: - Push notifications (APNs <-> FCM <-> Capacitor bridge)
    //
    // Capacitor's @capacitor/push-notifications plugin listens for these two
    // NotificationCenter posts. On iOS, Capacitor hands the app the raw APNs device
    // token; without this bridge the plugin would surface that raw token instead of
    // the FCM token the server's sendPushNotification() (artifacts/api-server/src/lib/push.ts)
    // actually sends to, via firebase-admin's sendEachForMulticast. Mirrors the Capacitor +
    // Firebase guide: https://capacitorjs.com/docs/guides/push-notifications-firebase

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
            Messaging.messaging().token { fcmToken, error in
                if let error = error {
                    NotificationCenter.default.post(
                        name: .capacitorDidFailToRegisterForRemoteNotifications,
                        object: error
                    )
                    return
                }
                guard let fcmToken = fcmToken else { return }
                NotificationCenter.default.post(
                    name: .capacitorDidRegisterForRemoteNotifications,
                    object: fcmToken
                )
            }
            return
        }
        #endif
        // No Firebase configured (e.g. local build without the plist) — fall back to the raw APNs token.
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
