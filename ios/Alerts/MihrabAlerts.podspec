# The alerts' engine on iPhone, iPad and Mac: notifee 9.1.8 — its core
# (NotifeeCore/) and its React Native bridge (RNNotifee/) — in our tree,
# built from source, unchanged. Notifee is Apache-2.0 (LICENSE) and no
# longer maintained; here it is ours to fix. The native module keeps its
# name (NotifeeApiModule), which is what src/native/notifee asks for.
Pod::Spec.new do |s|
  s.name         = 'MihrabAlerts'
  s.version      = '9.1.8'
  s.summary      = "Mihrab's notifications: notifee, in-tree."
  s.description  = 'Notifee 9.1.8 (core and React Native bridge), kept in the Mihrab tree.'
  s.homepage     = 'https://github.com/MihrabHQ/Mihrab'
  s.license      = { :type => 'Apache-2.0', :file => 'LICENSE' }
  s.authors      = 'Invertase Limited'
  s.source       = { :path => '.' }

  s.ios.deployment_target = '15.1'

  s.dependency 'React-Core'
  s.source_files = 'RNNotifee/*.{h,m}', 'NotifeeCore/*.{h,m}'
end
